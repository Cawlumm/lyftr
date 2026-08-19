import { Pressable, Text, ActivityIndicator } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props {
  title: string
  onPress?: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  className?: string
}

const VARIANT: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: 'bg-brand-500 active:bg-brand-700', text: 'text-white' },
  secondary: { bg: 'bg-surface-muted border border-surface-border', text: 'text-tx-primary' },
  ghost: { bg: '', text: 'text-tx-muted' },
  danger: { bg: 'bg-error-500/10 border border-error-500/20', text: 'text-error-400' },
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
}: Props) {
  const { accent } = useTheme()
  const v = VARIANT[variant]
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      // active:scale-95 is the standard press feedback for every tappable (see
      // CONVENTIONS.md "native feel") — it reads as native where hover states can't.
      // px-4 matters only when the button sizes to its own label. Nearly every caller
      // passes flex-1 or fills a column, so the padding is invisible there — but a
      // centred button with none had its text touching both edges.
      //
      // Deliberately not px-5, which web's same-height btn-lg uses: the tightest caller
      // is the two-button row on the change-password card, where at 390dp each half has
      // only ~23dp of slack around "Update password". px-4 clears that; px-5 would sit
      // on the edge of squeezing the label.
      className={`h-12 px-4 rounded-lg flex-row items-center justify-center gap-2 active:scale-95 ${v.bg} ${isDisabled ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? (
        // White only sits on the brand-filled primary; other variants keep the surface
        // background, where a white spinner would vanish on the light theme.
        <ActivityIndicator color={variant === 'primary' ? '#fff' : accent} />
      ) : (
        <Text className={`font-sans-bold text-sm ${v.text}`}>{title}</Text>
      )}
    </Pressable>
  )
}
