import { Animated, Platform } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Sheet } from './Sheet'

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
