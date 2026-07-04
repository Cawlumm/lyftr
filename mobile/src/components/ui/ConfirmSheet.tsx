import { Modal, Pressable, View } from 'react-native'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { LucideIcon } from 'lucide-react-native'
import { AppText } from './Typography'

interface Props {
  open: boolean
  title: string
  /** Body copy under the title (e.g. what will be deleted). */
  message: string
  /** Confirm button label; shows `busyLabel` while `busy`. */
  confirmLabel: string
  busyLabel?: string
  cancelLabel?: string
  /** Destructive styling on the confirm button (red fill) + optional icon. */
  destructive?: boolean
  icon?: LucideIcon
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Mirrors web WorkoutDetail's delete bottom sheet (createPortal → RN Modal): a
// scrim you tap to dismiss and a sheet that slides up from the bottom edge with a
// grabber handle, title, message, and a Cancel / confirm button pair.
//
// Two device-specific fixes over the naive version:
//  • Insets: a SafeAreaProvider nested *inside* a Modal measures 0 on a real phone,
//    so the buttons ended up under the home indicator ("cut off at the bottom"). We
//    read the real insets from the root provider with useSafeAreaInsets() (this
//    component sits in the app tree; the Modal is just a portal) and pad manually.
//  • Motion: animationType="slide" slides the *whole* overlay — scrim included — up
//    from the bottom, so the gray "flowed in" strangely. We fade the scrim in place
//    (animationType="fade") and slide only the sheet with Reanimated's SlideInDown.
export function ConfirmSheet({
  open, title, message, confirmLabel, busyLabel, cancelLabel = 'Cancel',
  destructive = false, icon: Icon, busy = false, onConfirm, onCancel,
}: Props) {
  const insets = useSafeAreaInsets()
  if (!open) return null

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      {/* Tap the scrim to cancel; the sheet stops propagation. */}
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onCancel}>
        <Animated.View entering={SlideInDown.duration(260)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ paddingBottom: insets.bottom + 24 }}
            className="rounded-t-2xl border border-surface-border bg-surface-base px-6 pt-3"
          >
            {/* Grabber — matches the web handle; signals a dismissible sheet. */}
            <View className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-muted" />
            <AppText variant="subheading" className="mb-1">{title}</AppText>
            <AppText variant="body" color="muted" className="mb-5">{message}</AppText>
            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                className="h-12 flex-1 items-center justify-center rounded-xl bg-surface-muted active:opacity-70"
              >
                <AppText variant="bodySemibold" color="secondary">{cancelLabel}</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onConfirm}
                disabled={busy}
                className={`h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl active:opacity-80 ${
                  destructive ? 'bg-error-500' : 'bg-brand-500'
                } ${busy ? 'opacity-50' : ''}`}
              >
                {Icon ? <Icon size={15} color="#ffffff" strokeWidth={2.4} /> : null}
                <AppText variant="bodySemibold" style={{ color: '#ffffff' }}>
                  {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
                </AppText>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}
