import { useTheme } from '../../theme/useTheme'
import { NumericInput } from './NumericInput'

interface Props {
  value: string
  onChange: (next: string) => void
  /** 'numeric' = integers only (reps); 'decimal' allows one decimal point (weight). */
  inputMode?: 'numeric' | 'decimal'
  placeholder?: string
  disabled?: boolean
  accessibilityLabel?: string
  /** iOS: id of an InputAccessoryView (e.g. NUMERIC_ACCESSORY_ID) to show a Done bar. */
  inputAccessoryViewID?: string
}

// Mirrors web ui/NumberField: borderless big-number field for the inside of a
// StepperTile (the tile is the visual container). Robust partial-entry typing via
// useNumericText; the parent owns conversion/validation in onChange.
export function NumberField({
  value,
  onChange,
  inputMode = 'decimal',
  placeholder = '0',
  disabled = false,
  accessibilityLabel,
  inputAccessoryViewID,
}: Props) {
  const { colors } = useTheme()
  return (
    <NumericInput
      value={value}
      onChangeText={onChange}
      inputMode={inputMode}
      editable={!disabled}
      placeholder={placeholder}
      placeholderTextColor={colors.txMuted}
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      inputAccessoryViewID={inputAccessoryViewID}
      // tabular-nums keeps the value from jittering as digits change (web parity).
      className={`w-full py-1 text-center font-display-heavy text-3xl text-tx-primary ${disabled ? 'opacity-40' : ''}`}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  )
}
