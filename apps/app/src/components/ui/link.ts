import { Platform, type GestureResponderEvent } from 'react-native'

export type Click = { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; preventDefault?: () => void }

// A modified or non-primary click is the browser's (new tab, new window, download), exactly as
// react-navigation's PlatformPressable decides for the default tab bar.
export const isPlainClick = (e: Click) => !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (e.button == null || e.button === 0)

// Spread on a Pressable that opens a page. On web react-native-web renders it as an <a href>, so
// middle-click, "open in new tab" and "copy link" work, while a plain click still goes through the
// router and keeps the stack's history. Native keeps the button it always was.
export function linkProps(href: string, go: () => void) {
  if (Platform.OS !== 'web') return { accessibilityRole: 'button' as const, onPress: go }
  const onPress = (e: GestureResponderEvent) => {
    const click = e as unknown as Click
    if (!isPlainClick(click)) return
    click.preventDefault?.()
    go()
  }
  // RN's types have no href; react-native-web forwards it to the DOM.
  return { accessibilityRole: 'link' as const, onPress, ...({ href } as object) }
}
