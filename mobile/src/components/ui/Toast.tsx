import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated'
import { X, ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

export type ToastVariant = 'default' | 'success' | 'brand' | 'warning' | 'error'

interface Props {
  title: string
  description?: string
  icon?: LucideIcon
  variant?: ToastVariant
  /** When set, the body is tappable (a chevron affordance is shown). */
  onPress?: () => void
  onDismiss: () => void
  /** Auto-dismiss delay; pass 0 to keep it until dismissed. Default 4s. */
  autoDismissMs?: number
  /** Extra classes on the absolute wrapper (e.g. to raise the dock point). */
  className?: string
}

// Semantic colour applied only to the icon chip + border, keeping the text in the
// normal tx-* hierarchy — a fully tinted toast reads as obnoxious over content.
const VARIANTS: Record<ToastVariant, { border: string; chip: string }> = {
  default: { border: 'border-surface-border', chip: 'bg-surface-muted border-surface-border' },
  success: { border: 'border-success-500/20', chip: 'bg-success-500/10 border-success-500/20' },
  brand:   { border: 'border-brand-500/20',   chip: 'bg-brand-500/10 border-brand-500/20' },
  warning: { border: 'border-warning-500/20', chip: 'bg-warning-500/10 border-warning-500/20' },
  error:   { border: 'border-error-500/20',   chip: 'bg-error-500/10 border-error-500/20' },
}

// A dismissible floating toast — the app's shared transient notification, mirror of
// web ui/Toast. No portal needed on RN: render it as the LAST child of the screen
// root and the absolute wrapper docks it just above the tab bar (screen content is
// laid out above the bar, so bottom-3 clears it without a height constant).
export function Toast({
  title,
  description,
  icon: Icon,
  variant = 'default',
  onPress,
  onDismiss,
  autoDismissMs = 4000,
  className = '',
}: Props) {
  const { colors, brand, accent, isDark } = useTheme()

  // Armed once on mount — parent re-renders must not extend the window (0 disables).
  useEffect(() => {
    if (!autoDismissMs) return
    const id = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Icon `color` is a component prop, so it must come from the theme object (not a
  // className). Soft shades read on dark but wash out on light — pick via isDark
  // (same legibility rule as IconButton's danger variant).
  const ICON_COLOR: Record<ToastVariant, string> = {
    default: colors.txSecondary,
    success: isDark ? brand.successSoft : brand.success,
    brand: accent,
    warning: isDark ? brand.warningSoft : brand.warning,
    error: isDark ? brand.errorSoft : brand.error,
  }
  const v = VARIANTS[variant]

  const body = (
    <>
      {Icon && (
        <View className={`w-8 h-8 rounded-full border items-center justify-center ${v.chip}`}>
          <Icon size={16} color={ICON_COLOR[variant]} />
        </View>
      )}
      <View className="flex-1">
        <AppText variant="subheading">{title}</AppText>
        {description ? (
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {description}
          </AppText>
        ) : null}
      </View>
      {onPress && <ChevronRight size={16} color={colors.txMuted} />}
    </>
  )

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutDown.duration(150)}
      accessibilityRole="alert"
      className={`absolute bottom-3 left-3 right-3 z-50 ${className}`}
    >
      <View className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 bg-surface-raised border shadow-lg ${v.border}`}>
        {onPress ? (
          <Pressable onPress={onPress} className="flex-row items-center gap-3 flex-1 active:scale-95">
            {body}
          </Pressable>
        ) : (
          <View className="flex-row items-center gap-3 flex-1">{body}</View>
        )}
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          hitSlop={8}
          className="p-1.5 -m-1.5 active:opacity-60"
        >
          <X size={16} color={colors.txMuted} />
        </Pressable>
      </View>
    </Animated.View>
  )
}
