import { fireEvent, render, screen } from '@testing-library/react-native'
import { i18n } from '@lyftr/shared'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { DateInput } from './DateInput.web'

// useTheme reaches lib/lyftr, which needs storage and expo-router (see FoodEntryRow.test).
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

// Imported by path: jest-expo's default (native) project resolves DateInput.tsx for the
// bare name, so the web file is exercised directly. Locale is stated in each test.
const input = () => screen.getByLabelText(/./)

describe('DateInput.web', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('emits the picked day', async () => {
    const onChange = jest.fn()
    await render(<DateInput value="2026-06-15" onChange={onChange} />)
    await fireEvent(input(), 'change', { target: { value: '2026-06-20' } })
    expect(onChange).toHaveBeenCalledWith('2026-06-20')
  })

  it('ignores a cleared input', async () => {
    const onChange = jest.fn()
    await render(<DateInput value="2026-06-15" onChange={onChange} />)
    await fireEvent(input(), 'change', { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens the native picker on click', async () => {
    const showPicker = jest.fn()
    await render(<DateInput value="2026-06-15" onChange={() => {}} />)
    await fireEvent(input(), 'click', { currentTarget: { showPicker } })
    expect(showPicker).toHaveBeenCalledTimes(1)
  })

  it('survives a click where showPicker is missing or throws', async () => {
    await render(<DateInput value="2026-06-15" onChange={() => {}} />)
    await fireEvent(input(), 'click', { currentTarget: {} })
    await fireEvent(input(), 'click', { currentTarget: { showPicker: () => { throw new Error('SecurityError') } } })
  })

  it('uses the bound as max', async () => {
    await render(<DateInput value="2026-06-15" onChange={() => {}} maximumDate={new Date(2026, 5, 20, 9)} />)
    expect(input().props.max).toBe('2026-06-20')
  })

  it('widens max to a value dated after the bound', async () => {
    await render(<DateInput value="2026-06-25" onChange={() => {}} maximumDate={new Date(2026, 5, 20, 9)} />)
    expect(input().props.max).toBe('2026-06-25')
  })

  it('sets no max without a bound', async () => {
    await render(<DateInput value="2026-06-15" onChange={() => {}} />)
    expect(input().props.max).toBeUndefined()
  })

  it('labels the input with the label (en)', async () => {
    await render(<DateInput label="Date" value="2026-06-15" onChange={() => {}} />)
    expect(input().props['aria-label']).toBe('Date')
  })

  it('falls back to the translated default label (en)', async () => {
    await render(<DateInput value="2026-06-15" onChange={() => {}} />)
    expect(input().props['aria-label']).toBe('Pick date')
  })

  it('draws the day in the app language (es)', async () => {
    await i18n.changeLanguage('es')
    await render(<DateInput value="2026-06-15" onChange={() => {}} />)
    expect(screen.getByText(/15 jun 2026/)).toBeTruthy()
    expect(input().props['aria-label']).toBe('Elegir fecha')
  })
})
