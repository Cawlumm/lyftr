module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated 4 moved its Babel plugin into react-native-worklets. MUST be last.
      'react-native-worklets/plugin',
    ],
  }
}
