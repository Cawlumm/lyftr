import type { ReactNode } from 'react'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

// Native half of the Sheet's frame; SheetFrame.web.tsx is the browser's. On a phone the sheet
// is always a bottom sheet, and the scrim and surface are Pressables so a tap on the surface
// is swallowed instead of reaching the scrim.

export const useSheetDialog = () => false

export const dialogA11y = (_labelledBy?: string, _describedBy?: string) => ({})

export function SheetBackdrop({ onClose, children }: { onClose: () => void; dialog: boolean; children: ReactNode }) {
  return (
    <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
      {children}
    </Pressable>
  )
}

export function SheetSurface({ className, style, children }: { className: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable onPress={(e) => e.stopPropagation()} style={style} className={className}>
      {children}
    </Pressable>
  )
}
