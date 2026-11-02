import { render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { AppText } from './Typography'

// useTheme reaches lib/lyftr, which needs storage and expo-router (see ErrorState.test.tsx).
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

describe('AppText headings', () => {
  it('renders title as a level-1 heading (header trait on native, <h1> on web)', async () => {
    await render(<AppText variant="title">Workouts</AppText>)
    const node = screen.getByRole('heading', { name: 'Workouts' })
    expect(node.props['aria-level']).toBe(1)
  })

  it('renders heading as level 2 and body as plain text', async () => {
    await render(
      <>
        <AppText variant="heading">Section</AppText>
        <AppText variant="body">Copy</AppText>
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Section' }).props['aria-level']).toBe(2)
    expect(screen.queryByRole('heading', { name: 'Copy' })).toBeNull()
  })
})
