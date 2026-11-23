import { Animated, Platform } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Sheet, SHEET_ANIM_MS, SHEET_CLOSE_MAX_MS } from './Sheet'

// The Modal's props, so a test can play the native side (iOS reporting a finished dismissal).
let mockModalProps: { onDismiss?: () => void } = {}
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: (p: { visible?: boolean; children?: unknown; onDismiss?: () => void }) => {
    mockModalProps = p
    return p.visible ? p.children : null
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Terminating a drag springs the sheet back, which is the shortest path to an Animated call.
describe('Sheet native driver', () => {
  const os = Platform.OS
  afterEach(() => {
    Platform.OS = os
    jest.restoreAllMocks()
  })

  it.each([
    ['ios', true],
    ['android', true],
    ['web', false],
  ] as const)('on %s asks for the native driver: %s', async (platform, expected) => {
    Platform.OS = platform
    const spring = jest.spyOn(Animated, 'spring')
    await render(<Sheet open onClose={() => {}}>{null}</Sheet>)
    spring.mockClear()
    await fireEvent(screen.getByTestId('sheet-grabber'), 'responderTerminate', {
      nativeEvent: { touches: [] },
      touchHistory: { touchBank: [], numberActiveTouches: 0, indexOfSingleActiveTouch: -1, mostRecentTimeStamp: 0 },
    })
    expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: expected }))
  })
})

// Whatever a sheet's action opens next (the photo picker, the camera, another sheet) must wait
// until the sheet has gone: on iOS one presented over a modal that is still dismissing is lost,
// or takes the app down with it.
describe('Sheet onClosed', () => {
  const os = Platform.OS
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    Platform.OS = os
    jest.useRealTimers()
  })

  it('on iOS waits for the native dismissal, not the animation', async () => {
    Platform.OS = 'ios'
    const closed = jest.fn()
    const { rerender } = await render(<Sheet open onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await rerender(<Sheet open={false} onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await act(() => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(closed).not.toHaveBeenCalled()

    await act(() => { mockModalProps.onDismiss?.() })
    expect(closed).toHaveBeenCalledTimes(1)
    await act(() => { jest.advanceTimersByTime(SHEET_CLOSE_MAX_MS) })
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('on iOS still reports it when the dismissal is never reported', async () => {
    Platform.OS = 'ios'
    const closed = jest.fn()
    const { rerender } = await render(<Sheet open onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await rerender(<Sheet open={false} onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await act(() => { jest.advanceTimersByTime(SHEET_CLOSE_MAX_MS) })
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('on Android reports it after the exit animation', async () => {
    Platform.OS = 'android'
    const closed = jest.fn()
    const { rerender } = await render(<Sheet open onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await rerender(<Sheet open={false} onClose={() => {}} onClosed={closed}>{null}</Sheet>)
    await act(() => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(closed).toHaveBeenCalledTimes(1)
  })
})
