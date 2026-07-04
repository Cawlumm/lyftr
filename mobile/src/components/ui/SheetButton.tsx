import { Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

type Variant = 'muted' | 'neutral' | 'brandOutline' | 'primary' | 'destructive'

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
//  • muted        — gray fill, secondary label (Cancel)
//  • neutral      — gray fill, primary label + brand icon (a normal menu action)
//  • brandOutline — brand-tinted fill + border + accent label/icon (matches the
//                   detail screen's Edit pill)
//  • primary      — solid brand, white (the positive commit)
//  • destructive  — solid red, white (delete)
//
// Polish that makes them feel native: a light haptic + a subtle press-scale on tap,
// and a soft coloured shadow lifting the solid variants off the sheet.
const FILL: Record<Variant, string> = {
  muted: 'bg-surface-muted active:opacity-70',
  neutral: 'bg-surface-muted active:opacity-80',
  brandOutline: 'bg-brand-500/10 border border-brand-500/20 active:opacity-70',
  primary: 'bg-brand-500 active:opacity-90',
  destructive: 'bg-error-500 active:opacity-90',
}

export function SheetButton({
  label, onPress, variant = 'muted', icon: Icon, align = 'center', disabled = false,
}: Props) {
  const { colors, brand, accent } = useTheme()
  const labelColor =
    variant === 'muted' ? colors.txSecondary
    : variant === 'neutral' ? colors.txPrimary
    : variant === 'brandOutline' ? accent
    : '#ffffff'
  // Brand/neutral actions carry the accent glyph; filled variants carry white;
  // muted's icon (rare) matches its secondary label.
  const iconColor =
    variant === 'brandOutline' || variant === 'neutral' ? accent
    : variant === 'muted' ? colors.txSecondary
    : '#ffffff'

  // Solid variants lift off the sheet with a soft shadow tinted to their own colour;
  // outlined/muted stay flat (a shadow under a translucent fill reads as grime).
  const filled = variant === 'primary' || variant === 'destructive'
  const shadow = filled
    ? {
        shadowColor: variant === 'destructive' ? brand.error : brand.cyan,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: 5,
      }
    : undefined

  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onPress()
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={press}
      disabled={disabled}
      style={shadow}
      className={`h-[52px] w-full flex-row items-center gap-2.5 rounded-2xl active:scale-[0.98] ${
        align === 'left' ? 'justify-start px-4' : 'justify-center'
      } ${FILL[variant]} ${disabled ? 'opacity-50' : ''}`}
    >
      {Icon ? <Icon size={18} color={iconColor} strokeWidth={2.4} /> : null}
      <AppText variant="bodySemibold" style={{ color: labelColor }}>{label}</AppText>
    </Pressable>
  )
}
