// InputAccessoryView is iOS-only and react-native-web has no implementation, so the web
// build never imports it. Browsers dismiss their keyboards themselves.
export const NUMERIC_ACCESSORY_ID = 'lyftr-numeric-done'

export function NumericKeyboardAccessory() {
  return null
}
