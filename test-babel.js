const Parser = require('@babel/parser');
const generate = require('@babel/generator');

const code = '`a${arg1}b${arg2}c`';
console.dir(Parser.parse(code, {
  sourceType: 'module',
  plugins: [
    'jsx'
  ]
}).program.body[0].expression, {depth: null});

