import { fireEvent, render, screen } from '@testing-library/react-native'
// The `mock` prefix is what lets a jest.mock factory close over an import.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { NumberField } from './NumberField'

// Same preamble as the other component tests: expo-router can't load under bare jest,
// and this reaches it via useTheme → lib/lyftr. babel-jest hoists jest.mock above the
// imports regardless, so these sit below them.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const field = (props: Partial<React.ComponentProps<typeof NumberField>> = {}) => {
  const onChange = jest.fn()
  render(<NumberField value="" onChange={onChange} accessibilityLabel="Weight" {...props} />)
  return { input: screen.getByLabelText(props.accessibilityLabel ?? 'Weight'), onChange }
}

// What sanitizeNumericInput accepts is settled in packages/shared — number.test.ts owns
// that truth table. These only prove this component is wired to it and picks the right
// keyboard, so the rules don't get asserted twice in two places that could drift.
describe('NumberField', () => {
  it('sanitizes through the shared helper in decimal mode', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '12,5')
    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  it('sanitizes through the shared helper in numeric mode', () => {
    const { input, onChange } = field({ inputMode: 'numeric' })
    fireEvent.changeText(input, '12,5')
    expect(onChange).toHaveBeenCalledWith('125')
  })

  it('uses a decimal keyboard for decimals and a number pad for integers', () => {
    const { input } = field({ inputMode: 'decimal' })
    expect(input.props.keyboardType).toBe('decimal-pad')
    render(<NumberField value="" onChange={() => {}} inputMode="numeric" accessibilityLabel="Reps" />)
    expect(screen.getByLabelText('Reps').props.keyboardType).toBe('number-pad')
  })
})
