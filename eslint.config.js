import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const INTERNAL_IMPORT = { selector: 'ImportDeclaration[source.value=/^@\\x2f/]' };
const EXTERNAL_IMPORT = { selector: 'ImportDeclaration:not([source.value=/^@\\x2f/])' };
const FUNCTION_DECLARATION = {
  selector: 'VariableDeclaration:has(VariableDeclarator > ArrowFunctionExpression)',
};
const HOOK_CALL = {
  selector:
    'ExpressionStatement[expression.type="CallExpression"][expression.callee.name=/^use[A-Z]/]',
};
const HOOK_CALLBACK = {
  selector:
    'VariableDeclaration:has(VariableDeclarator > CallExpression[callee.name=/^use(Callback|Memo|EffectEvent)$/])',
};

export default tseslint.config(
  { ignores: ['**/dist/**', 'e2e', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      '@stylistic': stylistic,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      '@stylistic/lines-between-class-members': ['error', 'always'],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: EXTERNAL_IMPORT, next: INTERNAL_IMPORT },
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'always', prev: '*', next: ['const', 'let'] },
        {
          blankLine: 'any',
          prev: ['singleline-const', 'singleline-let'],
          next: ['singleline-const', 'singleline-let'],
        },
        {
          blankLine: 'always',
          prev: '*',
          next: ['return', 'throw', 'if', 'for', 'while', 'switch', 'try'],
        },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: ['interface', 'type', 'class', 'enum'], next: '*' },
        { blankLine: 'always', prev: '*', next: ['interface', 'type', 'class', 'enum'] },
        { blankLine: 'any', prev: 'export', next: 'export' },
        {
          blankLine: 'always',
          prev: ['multiline-export', 'multiline-const', 'multiline-let'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: ['multiline-export', 'multiline-const', 'multiline-let'],
        },
        { blankLine: 'always', prev: [FUNCTION_DECLARATION, HOOK_CALL, HOOK_CALLBACK], next: '*' },
        { blankLine: 'always', prev: '*', next: [FUNCTION_DECLARATION, HOOK_CALL, HOOK_CALLBACK] },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['apps/assistant-bff/**/*.ts'], languageOptions: { globals: globals.node } },
);
