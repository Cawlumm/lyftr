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

describe('NumberField', () => {
  // #141: Android's decimal-pad shows the locale's separator, and across most of Europe
  // that is a comma with no full stop available. Stripping it as "not a digit" deleted
  // the only separator those users could reach, so a weight of 12,5 was unenterable.
  it('accepts a comma as the decimal separator', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '12,5')
    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  it('still accepts a full stop', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '12.5')
    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  it('keeps only the first separator however it was typed', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '1,2,5')
    expect(onChange).toHaveBeenCalledWith('1.25')
  })

  // Reps are whole numbers, and a comma must not sneak a decimal in by the back door.
  it('drops the separator entirely in integer mode', () => {
    const { input, onChange } = field({ inputMode: 'numeric' })
    fireEvent.changeText(input, '12,5')
    expect(onChange).toHaveBeenCalledWith('125')
  })

  it('rejects letters and signs', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '-1a2b.5kg')
    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  // Typing "12," must leave the separator in place, or the field fights the user by
  // deleting it before they can type the fractional digit.
  it('keeps a trailing separator mid-typing', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.changeText(input, '12,')
    expect(onChange).toHaveBeenCalledWith('12.')
  })

  it('uses a decimal keyboard for decimals and a number pad for integers', () => {
    const { input } = field({ inputMode: 'decimal' })
    expect(input.props.keyboardType).toBe('decimal-pad')
    render(<NumberField value="" onChange={() => {}} inputMode="numeric" accessibilityLabel="Reps" />)
    expect(screen.getByLabelText('Reps').props.keyboardType).toBe('number-pad')
  })
})
