import { TextInput } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { useNumericText } from '../../hooks/useNumericText'

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

// Web blocks bad keys in onKeyDown; RN keyboards have no such hook, so we sanitize
// the changed text instead. Non-negative always; integer mode also strips the
// decimal point so reps can't be typed fractional.
function sanitize(raw: string, decimal: boolean): string {
  let v = raw.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '')
  if (decimal) {
    const i = v.indexOf('.')
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
  }
  return v
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
        const v = sanitize(raw, inputMode === 'decimal')
        setText(v)
        onChange(v)
      }}
      // tabular-nums keeps the value from jittering as digits change (web parity).
      className={`w-full py-1 text-center font-display-heavy text-3xl text-tx-primary ${disabled ? 'opacity-40' : ''}`}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  )
}
