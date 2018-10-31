const { parse, Visitor, HTML, HTMLTools } = require('./spacebars-parser.min.js');
const generate = require('@babel/generator');
const t = require('@babel/types');


function pathToId(path) {
  return path.filter(p => p !== '.' && p !== '..').map((p, idx) => {
    if (idx === 0) {
      return p;
    }
    const first = p[0].toUpperCase();
    return first + p.slice(1);
  }).join('');
}

function blockCallExpression(block) {
  const identifier = pathToId(block.path);
  if (block.args == null || block.args.length === 0) {
    return t.identifier(identifier);
  }
  return t.callExpression(
    t.identifier(identifier),
    []
  )
}

const TransformingVisitor = Visitor.extend();
TransformingVisitor.def({
  visitNull() {
    return t.nullLiteral();
  },
  visitPrimitive(value) {
    if (typeof value === 'string') {
      // todo use string literals when containing `{` or `}`
      return t.jsxText(value);
    }
    throw new Error('Primitive type should be wrapped');

    // if (typeof value === 'number') {
    //   return t.numericLiteral(value);
    // }
    // if (typeof value === 'boolean') {
    //   return t.booleanLiteral(value);
    // }
  },
  visitArray(array, ...args) {
    return array.map(node => this.visit(node));
  },
  visitComment(comment) {
    const empty = t.jsxEmptyExpression();
    empty.innerComments = empty.innerComments || [];
    empty.innerComments.push({
      type: 'CommentBlock',
      value: comment.value,
    });
    return empty;
  },
  visitCharRef(ref) {
    return t.jsxText(ref.html);
  },
  visitRaw(raw) {
    throw new Error('Not implemented.')
  },
  visitObject(tag) {
    if (!(tag instanceof HTMLTools.TemplateTag)) {

      throw new Error(`Unknown object: ${tag}`)
    }
    if (tag.type === 'ESCAPE') {
      // todo use string literals when containing `{` or `}`
      return t.jsxText(tag.value);
    }
    if (tag.type === 'DOUBLE' || tag.type === 'TRIPLE') {
      return blockCallExpression(tag)
    }
    if (tag.type === 'BLOCKOPEN') {
      return t.conditionalExpression(
        blockCallExpression(tag),
        toJSX(tag.content),
        toJSX(tag.elseContent)
      )
    }
    if (tag.type === 'INCLUSION') {
      return t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier('Inclusion'), [], true
        ),
        null,
        [],
        true
      )

    }

    throw new Error(`Unknown spacebars tag ${tag.type}`)
  },
  visitFunction(fn) {
    throw new Error('Not implemented')
  },
  visitTag: function (tag) {
    const attributes = [];
    if (tag.attrs != null) {
      (Array.isArray(tag.attrs) ? tag.attrs : [tag.attrs]).forEach(attrs => {
        if (attrs instanceof HTMLTools.TemplateTag) {
          if (attrs.type !== 'DOUBLE') {
            throw new Error(`Unknown attr template tag: ${attrs.type}`);
          }
          attributes.push(
            t.jsxSpreadAttribute(blockCallExpression(attrs))
          );
        } else {
          Object.entries(attrs).forEach(([attrName, attrValue]) => {
            // TODO remap blaze attributes names to JSX format
            if (Array.isArray(attrValue) || typeof attrValue !== 'string') {
              //throw new Error('Helpers in attributes, not yet implemented');
              attributes.push(
                t.jsxAttribute(
                  t.jsxIdentifier(attrName),
                  t.stringLiteral(''),
                )
              );
              return;
            }
            attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier(attrName),
                t.stringLiteral(attrValue),
              )
            )
          });
        }
      });
    }

    if (tag.children.length === 0) {
      return t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier(tag.tagName),
          attributes,
          true
        ),
        null,
        [],
        true,
      );

    }

    const children = tag.children
    .map(child => this.visit(child))
    .filter(child => !t.isJSXText(child) || !child.value.includes('\n') || child.value.trim() !== '')
    .map(child => {
      if (t.isJSXElement(child) || t.isJSXText(child)) {
        return child;
      }
      return t.jsxExpressionContainer(child);
    });

    return t.jsxElement(
      t.jsxOpeningElement(
        t.jsxIdentifier(tag.tagName),
        attributes,
        false
      ),
      t.jsxClosingElement(
        t.jsxIdentifier(tag.tagName)
      ),
      children,
      false
    );
  },
});

function toJSX(node) {
  // node can be null, an array, spacebars, tag, string, charref
  if (node == null) {
    return t.nullLiteral();
  }

  let wrapped = false;
  if (!(node instanceof HTML.Tag)) {
    wrapped = true;
    if (Array.isArray(node)) {
      node = new HTML.DIV(...node);
    } else {
      node = new HTML.DIV(node);
    }

  }
  const transformed = (new TransformingVisitor).visitTag(node);

  if (wrapped && t.isJSXElement(transformed)) {
    console.dir({
      transformed,
    }, { depth: null });
    if (transformed.children.length === 0) {
      return t.nullLiteral();
    }
    if (transformed.children.length === 1 && t.isJSXElement(transformed.children[0])) {
      return transformed.children[0];
    }
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      transformed.children
    );
  }
  return transformed;
}


const template = `
    <div class="panel-heading">
      <div class="pull-right">
        <div class="dropdown">
          <a class="dropdown-toggle btn btn-link" data-toggle="dropdown" href="#">
            Options <span class="caret"></span>
          </a>
          <ul class="dropdown-menu pull-right">
            <li class="disabled">
              <a href="#">Display Options</a>
            </li>
            <li class="divider"></li>
            {{#each periods}}
              <li>
                <a href="#" data-action="setPeriodFilter" data-period="{{p}}">
                  <i class="{{iconChecked}}"></i> {{p}} days
                </a>
              </li>
            {{/each}}
            {{#with p=-1}}
              <li>
                <a href="#" data-action="setPeriodFilter" data-period="{{p}}">
                  <i class="{{iconChecked}}"></i> Any Time
                </a>
              </li>
            {{/with}}
          </ul>
        </div>
      </div>
      <h3 class="panel-title">Incomplete Uploads</h3>
    </div>
`;
const parsed = parse(template);

const ast = {
  type: 'Program',
  body: [
    toJSX(parsed)
  ]
};
const generator = new generate.CodeGenerator(ast);
console.log(
  generator.generate().code
);
