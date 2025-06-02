import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import yml from 'eslint-plugin-yml';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['dist/'], 'dist'),
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
        plugins: { js },
        extends: ['js/recommended'],
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
        languageOptions: { globals: globals.node },
    },
    tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        files: ['**/*.json'],
        plugins: { json },
        language: 'json/json',
        extends: ['json/recommended'],
    },
    {
        files: ['package-lock.json'],
        rules: {
            'json/no-empty-keys': 'off',
        },
    },
    {
        files: ['**/*.jsonc'],
        plugins: { json },
        language: 'json/jsonc',
        extends: ['json/recommended'],
    },
    {
        files: ['**/*.json5'],
        plugins: { json },
        language: 'json/json5',
        extends: ['json/recommended'],
    },
    {
        files: ['**/*.md'],
        plugins: { markdown },
        language: 'markdown/gfm',
        extends: ['markdown/recommended'],
    },
    yml.configs['flat/recommended'],
    {
        files: ['.github/workflows/*.{yml,yaml}'],
        rules: {
            'yml/no-empty-mapping-value': 'off',
        },
    },
    yml.configs['flat/prettier'],
    prettierRecommended,
]);
