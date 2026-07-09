// Flat-config ESLint (v9) for the Expo app, extending Expo's shared config
// (eslint-config-expo, SDK-54-matched v57). The `lint` script blocks on errors.
const expoConfig = require('eslint-config-expo/flat')

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
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'expo-env.d.ts'],
  },
]
