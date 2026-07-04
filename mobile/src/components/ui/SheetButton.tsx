import { Pressable } from 'react-native'
import { AppText } from './Typography'

type Variant = 'muted' | 'primary' | 'destructive'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
}

// The chunky full-width-ish button used inside sheets (Cancel / confirm rows). Kept
// separate from the app's Button so sheets can evolve their own weight (52pt tall,
// rounded-2xl) without touching form buttons.
const FILL: Record<Variant, string> = {
  muted: 'bg-surface-muted active:opacity-70',
  primary: 'bg-brand-500 active:opacity-80',
  destructive: 'bg-error-500 active:opacity-80',
}

export function SheetButton({ label, onPress, variant = 'muted', disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`h-[52px] flex-1 items-center justify-center rounded-2xl ${FILL[variant]} ${disabled ? 'opacity-50' : ''}`}
    >
      <AppText
        variant="bodySemibold"
        color={variant === 'muted' ? 'secondary' : undefined}
        style={variant === 'muted' ? undefined : { color: '#ffffff' }}
      >
        {label}
      </AppText>
    </Pressable>
  )
}
