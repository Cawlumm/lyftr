import { fireEvent, render, screen } from '@testing-library/react-native'
// The `mock` prefix is what lets a jest.mock factory close over an import.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { configureNumberLocale } from '@lyftr/shared'
import { NumberField } from './NumberField'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// The display half of #141 had no component coverage at all: every rendered test ran at
// the en-US default, where toLocaleText is the identity, so removing it from all three
// weight fields left the whole suite green. These assert what is actually DRAWN on a
// comma locale — the thing a German user sees — rather than what onChange emits.
describe('NumberField on a comma locale', () => {
  beforeEach(() => configureNumberLocale({ locale: 'de-DE' }))
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  const field = (value: string) => {
    const onChange = jest.fn()
    render(<NumberField value={value} onChange={onChange} accessibilityLabel="Weight" />)
    return { input: screen.getByLabelText('Weight'), onChange }
  }

  it('draws a stored canonical value with the locale separator', () => {
    const { input } = field('102.5')
    expect(input.props.value).toBe('102,5')
  })

  it('emits canonical while drawing localised, so callers never see a comma', () => {
    const { input, onChange } = field('')
    fireEvent.changeText(input, '12,5')
    expect(onChange).toHaveBeenCalledWith('12.5')
    expect(Number(onChange.mock.calls[0][0])).toBe(12.5)
  })

  // Mid-typing: "12," must survive as a trailing separator and still be drawn as a comma.
  it('keeps a half-typed separator visible', () => {
    const { input, onChange } = field('')
    fireEvent.changeText(input, '12,')
    expect(onChange).toHaveBeenCalledWith('12.')
    expect(screen.getByLabelText('Weight').props.value).toBe('12,')
  })

  it('is untouched on an integer field, which has no separator to draw', () => {
    const onChange = jest.fn()
    render(
      <NumberField value="120" onChange={onChange} inputMode="numeric" accessibilityLabel="Reps" />,
    )
    expect(screen.getByLabelText('Reps').props.value).toBe('120')
  })
})
