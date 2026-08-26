// ESLint 9 flat config
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files
//
// Mirrors the backend's eslint.config.mjs but adds React + React Hooks + Refresh rules.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // ─── Base ignores ────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'playwright-report/',
      'test-results/',
    ],
  },

  // ─── Recommended JS + TS rules ──────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── App source (React + TS) ───────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ─── React Hooks ─────────────────────────────────────────
      ...reactHooks.configs.recommended.rules,

      // ─── React Refresh (HMR for Vite) ───────────────────────
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ─── Style (Prettier handles formatting) ───────────────
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // ─── TypeScript ─────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ─── shadcn/ui generated primitives (relax fast-refresh) ────
  // These files export both components and `xxxVariants` constants.
  // Splitting would diverge from upstream shadcn, so we relax the
  // fast-refresh rule for the ui/ folder.
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ─── Context providers export a React.Context (intentional) ──
  {
    files: ['src/contexts/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ─── Config files (vite.config.ts, etc.) ───────────────────────
  {
    files: ['*.config.{ts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // ─── Turn OFF formatting rules that conflict with Prettier ─────
  prettier,
);
