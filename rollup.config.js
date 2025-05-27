const commonjs = require('@rollup/plugin-commonjs');
const { nodeResolve } = require('@rollup/plugin-node-resolve');

module.exports = {
    input: 'src/index.js',
    output: {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: true,
        sourcemapExcludeSources: true,
    },
    plugins: [commonjs(), nodeResolve({ preferBuiltins: true })],
};
