import { TextInput } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { sanitizeNumericInput, useNumericText } from '@lyftr/shared'

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
  const [text, setText] = useNumericText(value)
  return (
    <TextInput
      value={text}
      editable={!disabled}
      placeholder={placeholder}
      placeholderTextColor={colors.txMuted}
      keyboardType={inputMode === 'numeric' ? 'number-pad' : 'decimal-pad'}
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      inputAccessoryViewID={inputAccessoryViewID}
      onChangeText={(raw) => {
        const v = sanitizeNumericInput(raw, inputMode)
        setText(v)
        onChange(v)
      }}
      // tabular-nums keeps the value from jittering as digits change (web parity).
      className={`w-full py-1 text-center font-display-heavy text-3xl text-tx-primary ${disabled ? 'opacity-40' : ''}`}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  )
}
