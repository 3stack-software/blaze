const Parser = require('@babel/parser');
const generate = require('@babel/generator');

const code = '<>What</>';
console.dir(Parser.parse(code, {
  sourceType: 'module',
  plugins: [
    'jsx'
  ]
}).program.body[0].expression, {depth: null});

