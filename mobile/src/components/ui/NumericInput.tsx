import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { useNumericField } from '@lyftr/shared'

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  value: string
  /** Receives canonical text ("12.5") whatever the locale draws. */
  onChangeText: (next: string) => void
  /** 'numeric' = whole numbers (reps, seconds); 'decimal' allows one separator. */
  inputMode?: 'numeric' | 'decimal'
}

// Every numeric field on mobile is one of these. Styling, refs and keyboard plumbing pass
// straight through, so a caller styles it exactly like the TextInput it replaces — the
// only thing it takes away is the ability to get the number handling wrong.
//
// React Native ships nothing for this. Its TextInput has no `inputFormatters` (Flutter's
// hook, and the reason wger needs no wrapper), and `onKeyPress` is documented as fires
// "before onChange" with no preventDefault — informational only. `maxLength` is the sole
// native-level filter and it only counts characters. Android goes further: ReactEditText
// installs an InternalKeyListener that permits all keyboard input through, "without the
// actual filtering done by other KeyListeners". So the field can only be fixed after the
// text arrives, which is what the hook below does.
//
// Two layers rather than one, which is what every comparable project converges on:
// react-aria pairs useNumberField with Spectrum's <NumberField>, and Expensify pairs
// LocaleDigitUtils' plain functions with AmountTextInput. The component covers a field
// that owns its own TextInput; the hook covers the rest — <Field> already renders a
// TextInput and takes props, so nothing can be wrapped around it and settings' four macro
// targets spread useNumericField directly. One seam either way.
//
// The hook is spread AFTER rest deliberately: value/onChangeText/keyboardType are the
// three things this component exists to own, so a caller cannot pass them back in.
export const NumericInput = forwardRef<TextInput, Props>(function NumericInput(
  { value, onChangeText, inputMode = 'decimal', ...rest },
  ref,
) {
  return <TextInput ref={ref} {...rest} {...useNumericField(value, onChangeText, inputMode)} />
})
