import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

export default {
  input: 'spacebars-parser.js',
  output: {
    file: 'spacebars-parser.min.js',
    format: 'cjs',
    name: 'spacebars-parser',
  },
  plugins: [
    resolve(),
    commonjs()
  ]
}
