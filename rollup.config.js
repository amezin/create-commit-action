const commonjs = require('@rollup/plugin-commonjs');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const license = require('rollup-plugin-license');

module.exports = {
    input: 'src/index.js',
    output: {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: true,
        sourcemapExcludeSources: true,
    },
    plugins: [
        commonjs(),
        nodeResolve({ preferBuiltins: true }),
        license({
            sourcemap: true,
            thirdParty: {
                allow: {
                    test: '(MIT OR Apache-2.0 OR ISC)',
                    failOnViolation: true,
                    failOnUnlicensed: true,
                },
                multipleVersions: true,
                output: {
                    file: 'dist/dependencies.txt',
                },
            },
        }),
    ],
};
