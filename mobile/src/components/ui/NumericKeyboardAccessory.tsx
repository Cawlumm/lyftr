import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native'

// iOS number-pad / decimal-pad keyboards have NO return key, so there's no built-in way
// to dismiss them once you're done typing reps/weights. This is the standard fix: a thin
// "Done" bar pinned above the numeric keyboard. Reference it from a numeric TextInput via
// `inputAccessoryViewID={NUMERIC_ACCESSORY_ID}`, and mount <NumericKeyboardAccessory/>
// once on the screen. Android keyboards already dismiss on back/return, and
// InputAccessoryView is iOS-only, so this is a no-op off iOS.
export const NUMERIC_ACCESSORY_ID = 'lyftr-numeric-done'

export function NumericKeyboardAccessory() {
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
      <View className="flex-row justify-end border-t border-surface-border bg-surface-raised px-2 py-1.5">
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityLabel="Dismiss keyboard" className="rounded-lg px-4 py-1.5 active:opacity-60">
          <Text className="font-sans-bold text-base text-brand-500">Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
