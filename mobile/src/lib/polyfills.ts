// Must be imported once, first, at app entry.
// - URL polyfill: Hermes lacks a complete `URL`; normalizeServerUrl() in @lyftr/shared
//   uses `new URL()`.
// - gesture-handler: required by react-native-screens / reanimated navigation.
import 'react-native-gesture-handler'
import 'react-native-url-polyfill/auto'
