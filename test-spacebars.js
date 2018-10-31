const SpacebarsCompiler = require('./spacebars-parser.min.js');



// const template = '<div what="maybe" what2="{{test}}" {{test null true 1 "xyz" arg1 arg2=something arg3=(something and)}}>data</div>';
//const template = '&nbsp;';
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
    </div>`;
const parsed = SpacebarsCompiler.parse(template);
console.dir(parsed, {depth: null});
