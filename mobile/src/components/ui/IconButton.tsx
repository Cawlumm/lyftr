import { Pressable } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'

type IconButtonVariant = 'brand' | 'danger' | 'ghost' | 'secondary' | 'solid'
type IconButtonSize = 'sm' | 'md' | 'lg'

interface Props {
  icon: LucideIcon
  /** Accessibility label — required, the button has no visible text. */
  label: string
  onPress?: () => void
  variant?: IconButtonVariant
  size?: IconButtonSize
  disabled?: boolean
  className?: string
}

const CONTAINER: Record<IconButtonSize, { box: string; icon: number }> = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 14 },
  md: { box: 'w-10 h-10 rounded-xl', icon: 16 },
  lg: { box: 'w-12 h-12 rounded-xl', icon: 20 },
}

const VARIANT: Record<IconButtonVariant, string> = {
  brand: 'bg-brand-500/10 border border-brand-500/20',
  danger: '',
  ghost: '',
  secondary: 'bg-surface-muted border border-surface-border',
  solid: 'bg-brand-500',
}

// Mirrors web ui/IconButton (same variants/sizes; onPress + accessibilityLabel
// instead of onClick + aria-label). Container styling is className; the icon's
// stroke is an SVG prop, so its color resolves from the theme.
export function IconButton({
  icon: Icon,
  label,
  onPress,
  variant = 'ghost',
  size = 'sm',
  disabled = false,
  className = '',
}: Props) {
  const { colors, brand, accent, isDark } = useTheme()
  const c = CONTAINER[size]
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
      className={`items-center justify-center active:scale-95 ${c.box} ${VARIANT[variant]} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Icon size={c.icon} color={iconColor[variant]} strokeWidth={2.2} />
    </Pressable>
  )
}
