const {
  parse,
  Visitor,
  HTML,
  HTMLTools
} = require("./spacebars-parser.min.js");
const generate = require("@babel/generator");
const t = require("@babel/types");
const prettier = require("prettier");

function escapeJsxText(value) {
  return value.replace(/{/g, "&lcub;").replace(/}/g, "&rcub;");
}

function ucfirst(p) {
  const first = p[0].toUpperCase();
  return first + p.slice(1);
}

function generatePathJSXIdentifier(path) {
  path = path.filter(p => p !== "." && p !== "..");
  if (path.length === 0) {
    return t.jsxIdentifier("Unknown");
  }
  const [first, ...rest] = path;
  let object = t.jsxIdentifier(ucfirst(first));
  rest.forEach(attrib => {
    object = t.jsxMemberExpression(object, t.jsxIdentifier(attrib));
  });
  return object;
}

// TODO support "contextIdentifiers" to handle parents
function generatePathIdentifier(path) {
  path = path.filter(p => p !== "." && p !== "..");
  if (path.length === 0) {
    return t.identifier("Unknown");
  }
  const [first, ...rest] = path;
  let object = t.identifier(first);
  rest.forEach(attrib => {
    object = t.memberExpression(object, t.identifier(attrib));
  });
  return object;
}

function generateMustache(path, args) {
  const identifier = generatePathIdentifier(path);
  if (args == null || args.length === 0) {
    // TODO valueOf(identifier)
    // where valueOf = x => typeof x === 'function' ? x() : x
    return identifier;
  }
  const g = generateArgs(args);
  const callArgs = [...g.args];
  const obj = toObject(g.kwargs);
  if (obj.properties.length) {
    callArgs.push(obj);
  }
  return t.callExpression(identifier, callArgs);
}

function toObject(map) {
  return t.objectExpression(
    Object.entries(map).map(([key, value]) =>
      t.objectProperty(t.stringLiteral(key), value)
    )
  );
}

function generateArg([argType, argValue]) {
  switch (argType) {
    case "STRING":
      return t.stringLiteral(argValue);
    case "NUMBER":
      return t.numericLiteral(argValue);
    case "BOOLEAN":
      return t.booleanLiteral(argValue);
    case "NULL":
      return t.nullLiteral();
    case "PATH":
      return generatePathIdentifier(argValue);
    case "EXPR":
      // The format of EXPR is ['EXPR', { type: 'EXPR', path: [...], args: { ... } }]
      return generateMustache(argValue.path, argValue.args);
    default:
      // can't get here
      throw new Error("Unexpected arg type: " + argType);
  }
}

function generateArgs(tagArgs) {
  const kwargs = {};
  const args = [];

  tagArgs.forEach(function(arg) {
    if (arg.length > 2) {
      kwargs[arg[2]] = generateArg(arg);
    } else {
      args.push(generateArg(arg));
    }
  });

  return { args, kwargs };
}

function generateJSXAttr(name, expr) {
  const id = t.jsxIdentifier(name);
  if (t.isStringLiteral(expr)) {
    return t.jsxAttribute(id, expr);
  }
  return t.jsxAttribute(id, t.jsxExpressionContainer(expr));
}

function generateInclusionArg(args) {
  // block & inclusion tags, only take one expression as an argument.
  if (!args.length) {
    return t.nullLiteral();
  }

  if (args[0].length === 3) {
    // convert a=1 b=2 into a literal {a: 1, b: 2}
    const kwargs = {};
    args.forEach(function(arg) {
      kwargs[arg[2]] = generateArg(arg);
    });
    return toObject(kwargs);
  }

  if (args[0][0] !== "PATH") {
    // literal value
    return generateArg(args[0]);
  }

  // convert arg1 arg2 into arg1(arg2)
  return generateMustache(args[0][1], args.slice(1));
}

const TransformingVisitor = Visitor.extend();
TransformingVisitor.def({
  visitNull() {
    return t.nullLiteral();
  },
  visitPrimitive(value) {
    if (typeof value === "string") {
      return t.jsxText(escapeJsxText(value));
    }
    throw new Error("Primitive type should be wrapped");

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
      type: "CommentBlock",
      value: comment.value
    });
    return empty;
  },
  visitCharRef(ref) {
    return t.jsxText(ref.html);
  },
  visitRaw(raw) {
    throw new Error("Not implemented.");
  },
  visitObject(tag) {
    if (!(tag instanceof HTMLTools.TemplateTag)) {
      throw new Error(`Unknown object: ${tag}`);
    }
    if (tag.type === "ESCAPE") {
      return t.jsxText(escapeJsxText(tag.value));
    }
    if (tag.type === "DOUBLE" || tag.type === "TRIPLE") {
      return generateMustache(tag.path, tag.args);
    }
    if (tag.type === "INCLUSION") {
      // TODO if using positional args: data={arg1(arg2, arg3, {kwargs})}
      return t.jsxElement(
        t.jsxOpeningElement(
          generatePathJSXIdentifier(tag.path, true),
          [generateJSXAttr("data", generateInclusionArg(tag.args))],
          true
        ),
        null,
        [],
        true
      );
    }
    if (tag.type === "BLOCKOPEN") {
      let { path, args, content, elseContent = null } = tag;

      if (path[0] === "if") {
        return t.conditionalExpression(
          generateArg(args[0]),
          toJSX(content, this),
          toJSX(elseContent, this)
        );
      }
      if (path[0] === "unless") {
        return t.conditionalExpression(
          t.unaryExpression("!", generateArg(args[0])),
          toJSX(content, this),
          toJSX(elseContent, this)
        );
      }

      // TODO when using with/each add prefix to contextIdentifiers
      let attrName = "attr";
      let arrowArgs = [];
      if (path[0] === "with") {
        attrName = "data";
        arrowArgs = [t.identifier("context")];
      } else if (path[0] === "each") {
        attrName = "items";
        arrowArgs = [t.identifier("item")];
      }

      if (
        path[0] === "each" &&
        args.length >= 3 &&
        args[1][0] === "PATH" &&
        args[1][1].length &&
        args[1][1][0] === "in"
      ) {
        const firstArg = generateArg(args[0]);
        if (t.isIdentifier(firstArg)) {
          arrowArgs = [firstArg];
        }
        args = args.slice(2);
      }

      const inclusionArg = generateInclusionArg(args);
      const attrs = [generateJSXAttr(attrName, inclusionArg)];
      const id = generatePathJSXIdentifier(path, true);

      if (path[0] === 'let' && t.isObjectExpression(inclusionArg)) {
        arrowArgs = [
          t.objectPattern(
            inclusionArg.properties.map( p => t.objectProperty(
              /* these should all be string literals, but totally safe */
              t.identifier(p.key.value),
              t.identifier(p.key.value),
              false,
              true
            ))
          )
        ]
      }
      if (elseContent == null) {
        // TODO compile 'each' to (helper).map(...)
        // these helpers change the data context, so they must be functional
        if (path[0] === "each" || path[0] === "with" || path[0] === "let") {
          return t.jsxElement(
            t.jsxOpeningElement(id, attrs, false),
            t.jsxClosingElement(id),
            [
              t.jsxExpressionContainer(
                t.arrowFunctionExpression(arrowArgs, toJSX(content, this))
              )
            ],
            false
          );
        }

        return t.jsxElement(
          t.jsxOpeningElement(id, attrs, false),
          t.jsxClosingElement(id),
          toJSXArray(tag.content, this),
          false
        );
      }

      return t.jsxElement(
        t.jsxOpeningElement(
          id,
          attrs.concat([
            t.jsxAttribute(
              t.jsxIdentifier("content"),
              t.jsxExpressionContainer(
                t.arrowFunctionExpression(arrowArgs, toJSX(content, this))
              )
            ),
            t.jsxAttribute(
              t.jsxIdentifier("elseContent"),
              t.jsxExpressionContainer(
                t.arrowFunctionExpression([], toJSX(elseContent, this))
              )
            )
          ]),
          true
        ),
        t.jsxClosingElement(id),
        [],
        true
      );
    }

    throw new Error(`Unknown spacebars tag ${tag.type}`);
  },
  visitFunction(fn) {
    throw new Error("Not implemented");
  },
  visitTag: function(tag) {
    const attributes = [];
    if (tag.attrs != null) {
      (Array.isArray(tag.attrs) ? tag.attrs : [tag.attrs]).forEach(attrs => {
        if (attrs instanceof HTMLTools.TemplateTag) {
          const attrValue = attrs;
          if (attrs.type !== "DOUBLE") {
            throw new Error(`Unknown attr template tag: ${attrValue.type}`);
          }
          attributes.push(
            t.jsxSpreadAttribute(
              generateMustache(attrValue.path, attrValue.args)
            )
          );
        } else {
          Object.entries(attrs).forEach(([attrName, attrValue]) => {
            // TODO remap blaze attributes names to JSX format
            // TODO parse style attributes into object literal
            if (Array.isArray(attrValue)) {
              // TODO support helpers _within_ attributes
              //throw new Error('Helpers in attributes, not yet implemented');
              attributes.push(
                t.jsxAttribute(
                  t.jsxIdentifier(attrName),
                  t.stringLiteral("mixed attr")
                )
              );
              return;
            }
            if (attrValue instanceof HTMLTools.TemplateTag) {
              // TODO we can have if/unless inside attributes
              if (attrValue.type !== "DOUBLE") {
                throw new Error(`Unknown attr template tag: ${attrValue.type}`);
              }
              attributes.push(
                t.jsxAttribute(
                  t.jsxIdentifier(attrName),
                  t.jsxExpressionContainer(
                    generateMustache(attrValue.path, attrValue.args)
                  )
                )
              );
              return;
            }
            attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier(attrName),
                t.stringLiteral(attrValue)
              )
            );
          });
        }
      });
    }

    if (tag.children.length === 0) {
      return t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier(tag.tagName), attributes, true),
        null,
        [],
        true
      );
    }

    const children = tag.children.map(child => this.visit(child)).map(child => {
      if (t.isJSXElement(child) || t.isJSXText(child)) {
        return child;
      }
      return t.jsxExpressionContainer(child);
    });

    return t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier(tag.tagName), attributes, false),
      t.jsxClosingElement(t.jsxIdentifier(tag.tagName)),
      children,
      false
    );
  }
});

function toJSX(node, visitor = null) {
  // TODO reuse visitor

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
  const transformed = (visitor || new TransformingVisitor()).visitTag(node);

  if (wrapped && t.isJSXElement(transformed)) {
    // instead of wrapping [ <space>, <elem>, <space> ] with a fragment, just return <elem>
    const filtered = transformed.children.filter(
      child => !t.isJSXText(child) || child.value.trim() !== ""
    );
    if (filtered.length === 0) {
      return t.nullLiteral();
    }
    if (filtered.length === 1 && t.isJSXElement(filtered[0])) {
      return filtered[0];
    }
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      transformed.children
    );
  }
  return transformed;
}

function toJSXArray(node, visitor) {
  // TODO reuse visitor
  // node can be null, an array, spacebars, tag, string, charref
  if (node == null) {
    return []; //t.nullLiteral();
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
  const transformed = (visitor || new TransformingVisitor()).visitTag(node);

  if (wrapped && t.isJSXElement(transformed)) {
    // instead of wrapping [ <space>, <elem>, <space> ] with a fragment, just return <elem>
    const filtered = transformed.children.filter(
      child => !t.isJSXText(child) || child.value.trim() !== ""
    );
    if (filtered.length === 0) {
      return [];
    }
    if (filtered.length === 1 && t.isJSXElement(filtered[0])) {
      return filtered;
    }
    return children;
  }
  return transformed;
}

const template = `

{{> test arg1 true 1 "xyz" null arg2=something arg3=(something and)}}
    <div class="panel-heading">
    <!-- test -->
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
            {{#each period in periods}}
              <li>
                <a href="#" data-action="setPeriodFilter" data-period="{{period.p}}">
                  <i class="{{iconChecked period.p}}"></i> {{period.p}} days
                </a>
              </li>
            {{/each}}
            {{#let p=-1}}
              <li>
                <a href="#" data-action="setPeriodFilter" data-period="{{p}}">
                  <i class="{{iconChecked p}}"></i> Any Time
                </a>
              </li>
            {{/let}}
          </ul>
        </div>
      </div>
      <h3 class="panel-title">Incomplete Uploads</h3>
    </div>
`;
const parsed = parse(template);

const ast = {
  type: "Program",
  body: [toJSX(parsed)]
};
const generator = new generate.CodeGenerator(ast);
console.log(prettier.format(generator.generate().code, { parser: "babylon" }));
