import { useEffect, type ReactNode } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { Easing, SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'

// Duration of the slide-up; exported so callers can time a follow-up sheet (e.g. an
// ActionSheet handing off to a ConfirmSheet) to start after this one dismisses.
export const SHEET_ANIM_MS = 240

type SheetHaptic = 'selection' | 'warning' | 'none'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Extra bottom padding beyond the safe-area inset (px). */
  bottomInset?: number
  /** Haptic fired as the sheet opens. */
  haptic?: SheetHaptic
}

// The generic bottom-sheet shell every sheet in the app is built from (ConfirmSheet,
// ActionSheet, …). Owns the device-correct behavior once, so nothing re-derives it:
//  • Insets — a SafeAreaProvider nested inside a Modal measures 0 on a real phone, so
//    we read the root provider's insets (this sits in the app tree; the Modal is just
//    a portal) and pad the sheet's bottom manually.
//  • Motion — animationType="slide" would slide the whole overlay, scrim included, up
//    from the bottom. Instead the scrim fades in place (animationType="fade") and only
//    the sheet slides, on an ease-out curve (no spring bounce).
// Children own their horizontal padding; the shell provides the surface, grabber, and
// safe bottom. Tap the scrim to dismiss; the sheet body stops propagation.
export function Sheet({ open, onClose, children, bottomInset = 20, haptic = 'none' }: Props) {
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (!open || haptic === 'none') return
    const fire = haptic === 'warning'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync()
    fire.catch(() => {})
  }, [open, haptic])

  if (!open) return null

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(SHEET_ANIM_MS).easing(Easing.out(Easing.cubic))}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ paddingBottom: insets.bottom + bottomInset }}
            className="rounded-t-3xl border border-surface-border bg-surface-base pt-3"
          >
            {/* Grabber — signals a dismissible sheet; matches the web handle. */}
            <View className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-muted" />
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}
