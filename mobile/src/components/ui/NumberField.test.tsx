import { render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { NumberField } from './NumberField'

// Same preamble as the other component tests: useTheme reaches expo-router and
// AsyncStorage via lib/lyftr, neither of which loads under bare jest.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

describe('NumberField', () => {
  it('selects its value on focus by default, so typing replaces a prefilled number', () => {
    render(<NumberField value="80" onChange={() => {}} accessibilityLabel="Weight" />)
    expect(screen.getByLabelText('Weight').props.selectTextOnFocus).toBe(true)
  })

  // Gym Mode opts out: a live set is corrected where the tap lands, as in List mode (#151).
  it('leaves the value alone on focus when asked to', () => {
    render(<NumberField value="80" onChange={() => {}} accessibilityLabel="Weight" selectOnFocus={false} />)
    expect(screen.getByLabelText('Weight').props.selectTextOnFocus).toBe(false)
  })
})
