import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'

// iOS numeric keypads (number-pad / decimal-pad) have no return key, so once the
// set table has focus the only way out is guessing "tap dead space". This docks a
// Done bar above the keypad — the standard iOS escape hatch — via
// InputAccessoryView (iOS-only by design; Android numeric keyboards ship their own
// done/next key, so it renders nothing there). Screens give the bar a unique
// nativeID and pass the same ID to their numeric inputs' `inputAccessoryViewID`.
// Kept in workouts/ (not ui/) until a second surface needs it.
export function KeyboardDoneBar({ nativeID }: { nativeID: string }) {
  const { accent } = useTheme()
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View className="flex-row justify-end border-t border-surface-border bg-surface-raised px-5 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          className="active:opacity-60"
        >
          <Text className="font-sans-semibold text-sm" style={{ color: accent }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
