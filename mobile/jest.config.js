// Jest config for the Expo / React Native app (unit + component tests).
//
// Runs under the `jest-expo` preset (RN test environment + Expo module mocks).
// Notes:
//  • testMatch is scoped to src/ ONLY — route files under app/ import expo-router at
//    module load, which jest can't resolve standalone, so we never collect them.
//  • @testing-library/react-native v13 auto-registers its matchers on import, so no
//    setup file is needed (the old @testing-library/jest-native package is deprecated).
//  • Overriding transformIgnorePatterns REPLACES jest-expo's list, so we must re-list
//    RN/Expo plus every ESM dep this app imports (lucide-react-native, react-native-svg,
//    nativewind, reanimated/worklets, expo-router, …) or their untranspiled `import`
//    syntax breaks the transform. The nutritionMeta test doubles as a canary for this.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // No trailing slash after the group: the prefixes must prefix-match so `react-native`
  // covers react-native-svg/-reanimated/-worklets/-css-interop and `expo` covers
  // expo-haptics/-router/-modules-core/etc. nativewind + lucide-react-native ship ESM and
  // match no prefix, so they're listed explicitly.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?' +
      '|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*' +
      '|nativewind|lucide-react-native))',
  ],
}
