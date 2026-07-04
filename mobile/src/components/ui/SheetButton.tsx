import { Pressable } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

type Variant = 'muted' | 'neutral' | 'primary' | 'destructive'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  /** Optional leading icon (e.g. the action's glyph). */
  icon?: LucideIcon
  /** Content alignment — 'left' for menu-row actions, 'center' for Cancel/confirm. */
  align?: 'center' | 'left'
  disabled?: boolean
}

// The chunky button used inside sheets (Cancel / confirm rows, and each ActionSheet
// option). 52pt tall, rounded-2xl, fills its parent's width. Variants:
//  • muted       — gray fill, secondary label (Cancel)
//  • neutral     — gray fill, primary label + brand icon (a normal menu action)
//  • primary     — solid brand, white (the positive commit)
//  • destructive — solid red, white (delete)
const FILL: Record<Variant, string> = {
  muted: 'bg-surface-muted active:opacity-70',
  neutral: 'bg-surface-muted active:opacity-80',
  primary: 'bg-brand-500 active:opacity-80',
  destructive: 'bg-error-500 active:opacity-80',
}

export function SheetButton({
  label, onPress, variant = 'muted', icon: Icon, align = 'center', disabled = false,
}: Props) {
  const { colors, accent } = useTheme()
  const labelColor =
    variant === 'muted' ? colors.txSecondary
    : variant === 'neutral' ? colors.txPrimary
    : '#ffffff'
  // Neutral actions get a brand-tinted icon against the dark label; filled variants
  // carry white; muted's icon (rare) matches its secondary label.
  const iconColor =
    variant === 'neutral' ? accent
    : variant === 'muted' ? colors.txSecondary
    : '#ffffff'

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`h-[52px] w-full flex-row items-center gap-2.5 rounded-2xl ${
        align === 'left' ? 'justify-start px-4' : 'justify-center'
      } ${FILL[variant]} ${disabled ? 'opacity-50' : ''}`}
    >
      {Icon ? <Icon size={18} color={iconColor} strokeWidth={2.4} /> : null}
      <AppText variant="bodySemibold" style={{ color: labelColor }}>{label}</AppText>
    </Pressable>
  )
}
