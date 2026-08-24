import { TextInput } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { sanitizeNumericInput, toLocaleText, useNumericText } from '@lyftr/shared'

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

// RN keyboards have no onKeyDown to block bad keys with, so every numeric field
// sanitizes the text it is handed. One shared implementation, in @lyftr/shared.
//
// The comma is load-bearing (#141). Android's decimal-pad shows the *locale's*
// separator, which is a comma across most of Europe — and on those keyboards there is
// no full stop to type instead. Stripping it as "not a digit" meant the only separator
// those users could reach was deleted on every keystroke, so a weight of 12,5 could not
// be entered at all. Fold it to a point rather than dropping it; the stored value stays
// machine-readable either way.

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
      // Draw the locale's separator; the buffer and onChange stay canonical, so no
      // caller has to learn a second notation. Text-level so a half-typed "12." keeps
      // the separator the user just pressed.
      value={toLocaleText(text)}
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
