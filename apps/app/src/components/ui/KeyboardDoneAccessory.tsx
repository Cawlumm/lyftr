import { InputAccessoryView, Keyboard, Platform, Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from './Typography'

// iOS number-pad / decimal-pad keyboards have NO return key, and a multiline field's return key
// adds a line, so there's no built-in way to dismiss them once you're done typing. This is the
// standard fix: a thin "Done" bar pinned above the keyboard. Point a TextInput at it with
// `inputAccessoryViewID={KEYBOARD_DONE_ID}` and mount <KeyboardDoneAccessory/> once on the screen.
// A screen that stays mounted under another with its own bar passes a unique `nativeID` to both
// sides. Android keyboards already dismiss on back/return, and InputAccessoryView is iOS-only,
// so this is a no-op off iOS.
export const KEYBOARD_DONE_ID = 'lyftr-keyboard-done'

export function KeyboardDoneAccessory({ nativeID = KEYBOARD_DONE_ID }: { nativeID?: string }) {
  const { t } = useTranslation()
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View className="flex-row justify-end border-t border-surface-border bg-surface-raised px-2 py-1.5">
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.dismissKeyboard')} className="rounded-lg px-4 py-1.5 active:opacity-60">
          <AppText variant="bodySemibold" color="brand">{t('common.done')}</AppText>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
