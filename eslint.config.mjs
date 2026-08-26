// ESLint 9 flat config
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // ─── Base ─────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'prisma/migrations/**', // generated SQL — not lintable
      'scripts/', // one-off scripts; relaxed
    ],
  },

  // ─── Recommended JS + TS rules ────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── Project-specific overrides ───────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      // ─── Style (Prettier handles formatting, but a few semantic choices) ──
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // ─── TypeScript ────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_', // allow `_req`, `_next` etc.
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // warn, not error — sometimes needed for raw middleware
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off', // too noisy for Express
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ─── Best practices ────────────────────────────────────
      'no-return-await': 'off', // typescript-eslint recommends using await
      'no-throw-literal': 'error', // only throw Error instances (use AppError)
    },
  },

  // ─── JS config files (ecosystem.config.js etc.) ──────────────
  {
    files: ['*.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
  },

  // ─── Turn OFF formatting rules that conflict with Prettier ───
  prettier,
);
