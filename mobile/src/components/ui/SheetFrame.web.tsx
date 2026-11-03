import { useRef, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useBreakpoint } from '../../lib/useBreakpoint'

// The browser's half of the Sheet's frame. RN Modal on react-native-web already traps Tab,
// closes on Escape and hands focus back to the opener; what it cannot know is that a Pressable
// is a <div tabindex="0">, so a Pressable scrim was the first thing it focused and a Tab stop of
// its own. Here neither the scrim nor the surface is focusable.

// From sm up the sheet is a centred dialog: a bottom sheet on a wide screen is a long trip for
// the pointer and reads as a stretched phone UI.
export const useSheetDialog = () => useBreakpoint().sm

// RN's types have no aria-describedby, though react-native-web renders it.
export const dialogA11y = (labelledBy?: string, describedBy?: string) =>
  ({ 'aria-labelledby': labelledBy, 'aria-describedby': describedBy }) as object

export function SheetBackdrop({ onClose, dialog, children }: { onClose: () => void; dialog: boolean; children: ReactNode }) {
  // Dismiss only when the press both started and ended on the scrim: selecting text in a field
  // and releasing past the dialog's edge must not throw the form away.
  const pressedScrim = useRef(false)
  return (
    <View
      testID="sheet-backdrop"
      className={`flex-1 bg-black/60 ${dialog ? 'items-center justify-center p-6' : 'justify-end'}`}
      onPointerDown={(e) => { pressedScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (pressedScrim.current && e.target === e.currentTarget) onClose()
        pressedScrim.current = false
      }}
    >
      {children}
    </View>
  )
}

export function SheetSurface({ className, style, children }: { className: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={style} className={className}>{children}</View>
}
