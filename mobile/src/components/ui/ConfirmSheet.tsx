import { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
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
  /** Destructive styling (red fill + red icon badge). */
  destructive?: boolean
  /** Shown in a tinted circular badge above the title — the app-confirm idiom. */
  icon?: LucideIcon
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// A polished, native-app-style confirm bottom sheet (mirrors web WorkoutDetail's
// portal sheet). A tinted circular icon badge gives the destructive action weight,
// the copy is centered under it, and the sheet springs up over a fading scrim.
//
// Two device-specific fixes baked in:
//  • Insets: a SafeAreaProvider nested *inside* a Modal measures 0 on a real phone,
//    so we read the root provider's insets with useSafeAreaInsets() (this component
//    is in the app tree; the Modal is just a portal) and pad manually.
//  • Motion: animationType="slide" would slide the whole overlay — scrim included —
//    up from the bottom. Instead the scrim fades in place (animationType="fade") and
//    only the sheet slides, with a Reanimated spring for a natural settle.
export function ConfirmSheet({
  open, title, message, confirmLabel, busyLabel, cancelLabel = 'Cancel',
  destructive = false, icon: Icon, busy = false, onConfirm, onCancel,
}: Props) {
  const insets = useSafeAreaInsets()
  const { brand, accent, isDark } = useTheme()

  // A little "pay attention" buzz as the sheet arrives — warning for destructive,
  // a soft selection tick otherwise (kit idiom, see RestPicker). Swallow on web.
  useEffect(() => {
    if (!open) return
    const fire = destructive
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync()
    fire.catch(() => {})
  }, [open, destructive])

  if (!open) return null

  // errorSoft reads on dark, error on light — same split as AuthError/IconButton.
  const badgeIconColor = destructive ? (isDark ? brand.errorSoft : brand.error) : accent

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      {/* Tap the scrim to cancel; the sheet stops propagation. */}
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onCancel}>
        <Animated.View entering={SlideInDown.springify().damping(22).stiffness(240)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ paddingBottom: insets.bottom + 20 }}
            className="rounded-t-3xl border border-surface-border bg-surface-base px-6 pt-3"
          >
            {/* Grabber — matches the web handle; signals a dismissible sheet. */}
            <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-muted" />

            {Icon ? (
              <View
                className={`mx-auto mb-4 h-14 w-14 items-center justify-center rounded-full ${
                  destructive ? 'bg-error-500/15' : 'bg-brand-500/15'
                }`}
              >
                <Icon size={24} color={badgeIconColor} strokeWidth={2.2} />
              </View>
            ) : null}

            <AppText variant="heading" className="mb-1.5 text-center">{title}</AppText>
            <AppText variant="body" color="muted" className="mb-6 text-center">{message}</AppText>

            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                className="h-[52px] flex-1 items-center justify-center rounded-2xl bg-surface-muted active:opacity-70"
              >
                <AppText variant="bodySemibold" color="secondary">{cancelLabel}</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onConfirm}
                disabled={busy}
                className={`h-[52px] flex-1 items-center justify-center rounded-2xl active:opacity-80 ${
                  destructive ? 'bg-error-500' : 'bg-brand-500'
                } ${busy ? 'opacity-50' : ''}`}
              >
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
