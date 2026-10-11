// One ESLint config for every NestJS service (gateway, auth, task, notification,
// tracking) — the lint counterpart of jest.base.ts. ESLint 9 looks for its config
// walking UP from the working directory, so `pnpm lint` in any service finds this.
//
// packages/shared re-exports it, so the shared code is held to the same rules.
//
// Errors are kept to rules that catch bugs. Style and the patterns the codebase
// uses on purpose (`any` at RPC boundaries, `require` for optional modules) are
// warnings: visible, never a failed run.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.js', '**/*.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // TypeScript already reports undefined names, and knows the Node/Jest globals.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      // Several sanitisers strip control characters ON PURPOSE (ICS, contact keys,
      // calendar text) — the one thing this rule exists to question.
      'no-control-regex': 'off',
      // Style only, and removing an escape inside a character class can change
      // what the pattern matches: a warning to look at, never an automatic edit.
      'no-useless-escape': 'warn',
    },
  },
  {
    // Specs build fakes freely; the rules above that catch bugs still apply.
    files: ['**/*.spec.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
