import { View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'
import { SheetButton } from './SheetButton'
import { Sheet } from './Sheet'

export interface ConfirmSheetProps {
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
  /** Why the last confirm failed. Keeps the sheet up so the retry is under the finger
   *  that just tapped, instead of dismissing to a banner somewhere off-screen. */
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

// A polished, native-app-style confirm sheet (mirrors web WorkoutDetail's portal
// sheet). A tinted circular icon badge gives the destructive action weight, the copy
// is centered under it, and a Cancel / confirm button pair sits below. The sheet
// chrome (slide-up, scrim, insets, grabber) lives in the generic Sheet.
export function ConfirmSheet({
  open, title, message, confirmLabel, busyLabel, cancelLabel = 'Cancel',
  destructive = false, icon: Icon, busy = false, error, onConfirm, onCancel,
}: ConfirmSheetProps) {
  const { brand, accent, isDark } = useTheme()
  // errorSoft reads on dark, error on light — same split as IconButton.
  const badgeIconColor = destructive ? (isDark ? brand.errorSoft : brand.error) : accent

  return (
    // Scrim tap and Android back both come through onClose, and neither may dismiss a
    // confirmed action still in flight: the sheet is where its failure gets reported.
    <Sheet open={open} onClose={busy ? () => {} : onCancel} haptic={destructive ? 'warning' : 'selection'}>
      <View className="px-6">
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

        {error ? (
          <View className="mb-5 rounded-xl border border-error-500/20 bg-error-500/10 px-3.5 py-3">
            <AppText variant="caption" color="error" className="text-center">{error}</AppText>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <SheetButton label={cancelLabel} variant="muted" disabled={busy} onPress={onCancel} />
          </View>
          <View className="flex-1">
            <SheetButton
              label={busy ? (busyLabel ?? confirmLabel) : confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              disabled={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Sheet>
  )
}
