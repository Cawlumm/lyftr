import { Pressable } from 'react-native'
import type { LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { Icon, type IconSize } from './Icon'
import { interactive } from './interaction'

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
}

const BOX: Record<IconSize, string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
}

const VARIANT: Record<IconButtonVariant, { bg: string; hover: string }> = {
  brand: { bg: 'bg-brand-500/10 border border-brand-500/20', hover: 'hover:bg-brand-500/20' },
  danger: { bg: '', hover: 'hover:bg-error-500/10' },
  ghost: { bg: '', hover: 'hover:bg-surface-muted' },
  secondary: { bg: 'bg-surface-muted border border-surface-border', hover: 'hover:bg-surface-border' },
  solid: { bg: 'bg-brand-500', hover: 'hover:bg-brand-600' },
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size === 'sm' ? 6 : 0}
      className={`items-center justify-center active:scale-95 ${BOX[size]} ${VARIANT[variant].bg} ${disabled ? 'opacity-40' : ''} ${interactive(VARIANT[variant].hover, { disabled })} ${className}`}
    >
      <Icon icon={icon} size={size} color={iconColor[variant]} />
    </Pressable>
  )
}
