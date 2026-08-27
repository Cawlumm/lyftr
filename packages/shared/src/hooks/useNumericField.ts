import { sanitizeNumericInput, toLocaleText } from '../utils/number'
import { useNumericText } from './useNumericText'

// The one seam. Every numeric input on mobile gets its three moving parts from here:
// sanitize what was typed, buffer it so a half-finished entry survives the parent
// re-deriving `value`, and draw it in the locale's own notation.
//
// A hook rather than a <NumberField> component, because the framework decides where a
// rule like this can live and React Native gives us nowhere else. Flutter -- which is
// what wger is written in -- puts it on the field itself: TextField takes
// `inputFormatters: [TextInputFormatter]`, so wger passes a formatter object per input
// and never needs a wrapper widget. React Native has no such hook, and no onKeyDown
// either: ReactEditText replaces Android's KeyListener specifically to "permit all
// keyboard input through". So the seam has to be ours, and a hook is the closest thing
// to Flutter's formatter -- attachable to any field without owning how it looks.
//
// Owning how it looks was the alternative, and it does not survive contact with the six
// call sites. They agree on exactly the three lines below and disagree on everything
// else: ref, returnKeyType, submitBehavior, onSubmitEditing, editable, placeholder
// colour, className, accessory id -- and selectTextOnFocus, which the set cells
// deliberately omit so a tap lands inside a prefilled "82,5" (the reason
// sanitizeNumericInput prefers the FIRST separator). A component taking all of those as
// props is a TextInput passthrough wearing a hat.
//
// Returns props to spread. `value` comes back localised and `onChangeText` hands back
// canonical text, so a caller never sees the locale's notation and cannot forget to
// convert. numericField.guard.test.ts fails the build if a numeric field skips this.
export function useNumericField(
  value: string,
  onChange: (next: string) => void,
  mode: 'numeric' | 'decimal' = 'decimal',
): {
  value: string
  onChangeText: (raw: string) => void
  keyboardType: 'number-pad' | 'decimal-pad'
} {
  const [text, setText] = useNumericText(value)
  return {
    value: toLocaleText(text),
    keyboardType: mode === 'numeric' ? 'number-pad' : 'decimal-pad',
    onChangeText: (raw: string) => {
      const next = sanitizeNumericInput(raw, mode)
      setText(next)
      onChange(next)
    },
  }
}
