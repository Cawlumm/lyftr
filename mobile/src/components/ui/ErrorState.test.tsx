import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { Button } from './Button'
import { ErrorState } from './ErrorState'

// Same preamble as the other component tests: expo-router can't load under bare jest, and
// the ui barrel reaches it via useTheme → lib/lyftr.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mobile gets no e2e — it is not in the Playwright suite and never will be — so these
// component tests are the only gate standing under the mobile half of this feature.
//
// They mirror web's ErrorState.test.tsx case for case on purpose: the two platforms are
// supposed to read as one screen, and a test that only exists on one side is how they
// quietly stop matching.
describe('ErrorState', () => {
  it('names what failed and why', () => {
    render(<ErrorState title="Couldn't load your dashboard" message="The server didn't respond in time." />)
    expect(screen.getByText("Couldn't load your dashboard")).toBeTruthy()
    expect(screen.getByText("The server didn't respond in time.")).toBeTruthy()
  })

  // Asserted on the root props rather than via getByRole: the role is not queryable
  // because the container is deliberately NOT `accessible` — making it so would collapse
  // the title, message and retry into a single unreachable announcement. On Android the
  // live region is what actually announces this, and it is the part that would regress
  // silently if someone deleted it.
  it('announces itself without swallowing the controls inside it', () => {
    const tree: any = render(<ErrorState title="Couldn't load" message="No answer." onRetry={() => {}} />).toJSON()
    expect(tree.props.accessibilityRole).toBe('alert')
    expect(tree.props.accessibilityLiveRegion).toBe('polite')
    expect(tree.props.accessible).toBeUndefined()
    // and the retry is still reachable as its own node
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('offers a retry that actually calls back', () => {
    const onRetry = jest.fn()
    render(<ErrorState title="Couldn't load" message="No answer." onRetry={onRetry} />)
    fireEvent.press(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows no retry when there is nothing to retry', () => {
    render(<ErrorState title="Couldn't load" message="No answer." />)
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('takes one escape hatch alongside the retry', () => {
    render(
      <ErrorState title="Couldn't load" message="No answer." onRetry={() => {}}
        secondary={<Button title="Back to workouts" variant="secondary" onPress={() => {}} />} />,
    )
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.getByText('Back to workouts')).toBeTruthy()
  })
})
