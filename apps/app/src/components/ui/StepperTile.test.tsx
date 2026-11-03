import { act, fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { Text } from 'react-native'
import { Scale } from './icons'
import { i18n } from '@lyftr/shared'
import { StepperTile } from './StepperTile'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// The +/- half of every prominent numeric input: bodyweight and gym mode both render
// through here, so the button wiring is tested once rather than per screen. Mirrors web's
// StepperTile.test.tsx; its `step` attribute cases are HTML-only and have no native twin.
const renderTile = async (props: Partial<React.ComponentProps<typeof StepperTile>> = {}) => {
  const onStep = jest.fn()
  await render(
    <StepperTile icon={Scale} label="Weight (lbs)" name="weight" step={0.1} onStep={onStep} {...props}>
      <Text>183.6</Text>
    </StepperTile>,
  )
  return onStep
}

describe('StepperTile', () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('names its step buttons from the catalog in Spanish', async () => {
    await i18n.changeLanguage('es')
    await renderTile()
    expect(screen.getByLabelText('Disminuir weight')).toBeTruthy()
    expect(screen.getByLabelText('Aumentar weight')).toBeTruthy()
  })

  it('renders the label and the value between the two buttons', async () => {
    await renderTile()
    expect(screen.getByText('Weight (lbs)')).toBeTruthy()
    expect(screen.getByText('183.6')).toBeTruthy()
    expect(screen.getByLabelText(/decrease/i)).toBeTruthy()
    expect(screen.getByLabelText(/increase/i)).toBeTruthy()
  })

  it('reports the step signed by direction, the caller owns the arithmetic', async () => {
    const onStep = await renderTile()
    await fireEvent.press(screen.getByLabelText(/increase/i))
    expect(onStep).toHaveBeenCalledWith(0.1)
    await fireEvent.press(screen.getByLabelText(/decrease/i))
    expect(onStep).toHaveBeenLastCalledWith(-0.1)
  })

  // 2.5, not the 0.1 above: a step equal to the other case's would pass whether or
  // not the prop is read at all.
  it('honours a coarser step', async () => {
    const onStep = await renderTile({ step: 2.5 })
    await fireEvent.press(screen.getByLabelText(/increase/i))
    expect(onStep).toHaveBeenCalledWith(2.5)
  })

  it('names the metric in both button labels, for screen readers', async () => {
    await renderTile({ name: 'reps' })
    expect(screen.getByLabelText('Increase reps')).toBeTruthy()
    expect(screen.getByLabelText('Decrease reps')).toBeTruthy()
  })

  it('disabled stops both buttons from stepping', async () => {
    const onStep = await renderTile({ disabled: true })
    await fireEvent.press(screen.getByLabelText(/increase/i))
    await fireEvent.press(screen.getByLabelText(/decrease/i))
    expect(onStep).not.toHaveBeenCalled()
  })
})
