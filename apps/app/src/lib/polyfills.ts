// Must be imported once, first, at app entry.
// - URL polyfill: Hermes lacks a complete `URL`; normalizeServerUrl() in @lyftr/shared
//   uses `new URL()`.
// - gesture-handler: required by react-native-screens / reanimated navigation.
import 'react-native-gesture-handler'
// - Intl.PluralRules: Hermes ships no PluralRules (its IntlAPIs.md lists only Collator,
//   NumberFormat and DateTimeFormat), and i18next >=24 has no fallback without it, so
//   Spanish _one/_many would silently never resolve. Installs itself only when missing.
import 'intl-pluralrules'
import 'react-native-url-polyfill/auto'
