// Flat-config ESLint (v9) for the Vite app. The `lint` script blocks on errors.
//
// Posture matches mobile/eslint.config.js deliberately: gate CI on correctness
// rules (hook order, unused bindings, empty blocks) and surface the stylistic ones
// as warnings for now. The project had 69 `any`s and 10 exhaustive-deps hits when
// linting was first turned on — making those errors would have meant either a
// multi-hour cleanup before anything could be gated, or a permanently red build.
// Warnings keep them visible; tighten rule by rule as they're worked through.
//
// The count is pinned in package.json (`--max-warnings=80`), so the backlog is a
// ratchet: it can shrink, never grow. Lower the number as they're cleared.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      'e2e/.auth',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Advisory for now — see the note at the top of this file.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Fast-refresh only survives when a module exports components alone. Warn:
      // several pages legitimately export a helper alongside their component.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // An `_`-prefixed binding is the conventional "deliberately unused" marker
      // (destructuring a field only to drop it, a required-but-ignored callback arg).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Playwright's fixture callback is named `use`, which trips the rules-of-hooks
    // heuristic ("a function starting with `use` must be a hook"). It isn't React.
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
)
