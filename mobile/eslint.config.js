// Flat-config ESLint (v9) for the Expo app, extending Expo's shared config
// (eslint-config-expo, SDK-54-matched v57). The `lint` script blocks on errors.
const expoConfig = require('eslint-config-expo/flat')
const i18next = require('eslint-plugin-i18next')
const i18nLint = require('../packages/shared/i18n-lint.cjs')

module.exports = [
  ...expoConfig,
  {
    rules: {
      // eslint-config-expo 57 enables the new React-Compiler-oriented react-hooks v6
      // rules by default. They're valuable once we adopt the React Compiler, but fire
      // heavily on existing (pre-compiler) code and would block CI on style, not bugs.
      // Off for now — revisit as a deliberate pass when/if we turn the compiler on.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // Noise in RN JSX — apostrophes in copy render fine; web doesn't gate on it either.
      'react/no-unescaped-entities': 'off',
      // Advisory (surfaced, non-blocking) for the first pass; tighten after a cleanup.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // The i18n guard: new screen copy goes through t() (CLAUDE.md, "UI Strings"). The
    // rule data lives in packages/shared/i18n-lint.cjs, shared with web.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'src/testing/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', i18nLint.noLiteralString],
      'no-restricted-syntax': ['error', ...i18nLint.restrictedSyntax],
    },
  },
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'expo-env.d.ts'],
  },
]
