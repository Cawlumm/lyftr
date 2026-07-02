module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Rewrite `import.meta` so the web target can bundle deps' ESM builds that use it
      // (e.g. zustand's dev warnings) — Metro can't handle bare import.meta. No-op on
      // native (which resolves those packages' CJS builds).
      'babel-plugin-transform-import-meta',
      // Reanimated 4 moved its Babel plugin into react-native-worklets. MUST be last.
      'react-native-worklets/plugin',
    ],
  }
}
