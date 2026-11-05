import type { Ref } from 'react'
import { Pressable, View, type PressableInstance } from 'react-native'
import type { LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { Icon, type IconSize } from './Icon'
import { TOUCH_MIN, touchTarget } from './interaction'

type IconButtonVariant = 'brand' | 'danger' | 'ghost' | 'secondary' | 'solid'

interface Props {
  icon: LucideIcon
  /** Accessibility label — required, the button has no visible text. */
  label: string
  onPress?: () => void
  variant?: IconButtonVariant
  size?: IconSize
  disabled?: boolean
  className?: string
  /** Neighbours closer than 44px: keep the visual box as the hit box rather than overlap them. */
  tight?: boolean
  /** For a caller that has to put focus back on the button after re-rendering it. */
  ref?: Ref<PressableInstance>
}

const BOX: Record<IconSize, { px: number; cls: string }> = {
  sm: { px: 32, cls: 'w-8 h-8 rounded-lg' },
  md: { px: 40, cls: 'w-10 h-10 rounded-xl' },
  lg: { px: 48, cls: 'w-12 h-12 rounded-xl' },
}

const VARIANT: Record<IconButtonVariant, { bg: string; hover: string }> = {
  brand: { bg: 'bg-brand-500/10 border border-brand-500/20', hover: 'group-hover/hit:bg-brand-500/20' },
  danger: { bg: '', hover: 'group-hover/hit:bg-error-500/10' },
  ghost: { bg: '', hover: 'group-hover/hit:bg-surface-muted' },
  secondary: { bg: 'bg-surface-muted border border-surface-border', hover: 'group-hover/hit:bg-surface-border' },
  solid: { bg: 'bg-brand-500', hover: 'group-hover/hit:bg-brand-600' },
}

// Mirrors web ui/IconButton (same variants/sizes; onPress + accessibilityLabel
// instead of onClick + aria-label). Container styling is className; the icon's
// stroke is an SVG prop, so its color resolves from the theme.
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'ghost',
  size = 'sm',
  disabled = false,
  className = '',
  tight = false,
  ref,
}: Props) {
  const { colors, brand, accent, isDark } = useTheme()
  const iconColor: Record<IconButtonVariant, string> = {
    brand: accent,
    // errorSoft reads well on dark but washes out on light — same split as AuthError.
    danger: isDark ? brand.errorSoft : brand.error,
    ghost: colors.txMuted,
    secondary: colors.txPrimary,
    solid: '#ffffff',
  }
  const box = BOX[size]
  const hit = touchTarget(tight ? TOUCH_MIN : box.px, tight ? TOUCH_MIN : box.px, { disabled })
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={hit.style}
      className={`items-center justify-center active:scale-95 ${disabled ? 'opacity-40' : ''} ${hit.outer} ${className}`}
    >
      <View className={`items-center justify-center ${box.cls} ${VARIANT[variant].bg} ${disabled ? '' : VARIANT[variant].hover} ${hit.inner}`}>
        <Icon icon={icon} size={size} color={iconColor[variant]} />
      </View>
    </Pressable>
  )
}
