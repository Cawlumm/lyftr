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
      className={`h-12 rounded-lg flex-row items-center justify-center gap-2 active:scale-95 ${v.bg} ${isDisabled ? 'opacity-40' : ''} ${className}`}
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
