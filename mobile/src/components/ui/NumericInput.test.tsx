import { createRef } from 'react'
import { TextInput } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { NumericInput } from './NumericInput'

// What sanitizeNumericInput accepts is settled in packages/shared — number.test.ts owns
// that truth table, and NumberField.test.tsx proves a styled wrapper stays wired to it.
// These cover the two things that are true of NumericInput itself and of nothing else,
// both of which fail silently: a caller taking back a prop it must not own, and a ref
// that stops reaching the native field.
describe('NumericInput', () => {
  it('sanitizes what the keyboard hands over, in both modes', () => {
    const onChangeText = jest.fn()
    render(<NumericInput value="" onChangeText={onChangeText} accessibilityLabel="Weight" />)
    fireEvent.changeText(screen.getByLabelText('Weight'), '12,5')
    expect(onChangeText).toHaveBeenCalledWith('12.5')

    const onReps = jest.fn()
    render(<NumericInput value="" onChangeText={onReps} inputMode="numeric" accessibilityLabel="Reps" />)
    fireEvent.changeText(screen.getByLabelText('Reps'), '12,5')
    expect(onReps).toHaveBeenCalledWith('125')
  })

  // The hook is spread after rest, so a keyboardType handed in by a caller loses. That
  // ordering is a one-character edit away from reversing, and reversing it would put every
  // numeric field in the app back on a raw keyboard — #141 again — while every other test
  // still passed, since each supplies its own value and onChangeText.
  //
  // Only keyboardType is pinned here, and that is the honest scope: `value` and
  // `onChangeText` are destructured by name, so JSX resolves them before this component
  // runs and no spread order inside it could defend them. Those two are held by the Omit
  // on Props — a compile-time guard, which is why the cast below is needed to get past it.
  it('keeps its own keyboard even when a caller passes one', () => {
    const onChangeText = jest.fn()
    render(
      <NumericInput
        value="7"
        onChangeText={onChangeText}
        accessibilityLabel="Weight"
        {...({ keyboardType: 'email-address' } as object)}
      />,
    )
    const input = screen.getByLabelText('Weight')

    expect(input.props.keyboardType).toBe('decimal-pad')
    fireEvent.changeText(input, '9,5')
    expect(onChangeText).toHaveBeenCalledWith('9.5')
  })

  // ExerciseFormCard chains focus reps → weight → next row's reps through callback refs.
  // forwardRef is what carries that through; drop it and the keyboard's "next" key stops
  // moving, which no assertion elsewhere would notice.
  it('forwards a ref to the underlying TextInput', () => {
    const ref = createRef<TextInput>()
    render(<NumericInput ref={ref} value="" onChangeText={() => {}} accessibilityLabel="Weight" />)
    expect(ref.current).not.toBeNull()
    expect(typeof ref.current?.focus).toBe('function')
  })

  // RestPicker and DurationField hold a number and map '' back to 0, so before this
  // component existed they re-rendered a literal "0" into the field the instant it was
  // cleared — backspace looked broken, and typing a new value meant deleting a zero first.
  // The buffer treats '' and 0 as the same value and declines to re-sync, which is what
  // makes clearing stick. Pinned because it is a behaviour change, not a refactor.
  it('does not refill a zero the moment the field is cleared', () => {
    const onChangeText = jest.fn()
    const rest = (v: string) => (
      <NumericInput value={v} onChangeText={onChangeText} inputMode="numeric" accessibilityLabel="Rest" />
    )
    const { rerender } = render(rest('0'))
    fireEvent.changeText(screen.getByLabelText('Rest'), '')
    expect(onChangeText).toHaveBeenCalledWith('')

    // the parent clamps '' back to 0 and hands the same "0" straight back
    rerender(rest('0'))
    expect(screen.getByLabelText('Rest').props.value).toBe('')
  })

  it('passes styling and keyboard plumbing straight through', () => {
    render(
      <NumericInput
        value=""
        onChangeText={() => {}}
        accessibilityLabel="Weight"
        placeholder="0"
        returnKeyType="next"
        editable={false}
      />,
    )
    const input = screen.getByLabelText('Weight')
    expect(input.props.placeholder).toBe('0')
    expect(input.props.returnKeyType).toBe('next')
    expect(input.props.editable).toBe(false)
  })
})
