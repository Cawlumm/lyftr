import { Platform, Text } from 'react-native'
import { renderRouter, screen } from 'expo-router/testing-library'
import TabsLayout from '../../app/(tabs)/_layout'

// The sidebar is web-only. A native tablet is as wide as a desktop window, so this renders the
// real (tabs) layout on iOS with the lg breakpoint met and checks the bottom tab bar is still
// what draws: its tabs, and none of the sidebar (wordmark, skip link, user menu).
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../theme/useTheme', () => ({
  useTheme: () => ({
    colors: { raised: '#fff', border: '#ddd', txMuted: '#999', txPrimary: '#000', txSecondary: '#555' },
    brand: { cyan: '#0bc' },
    accent: '#0bc',
  }),
}))
jest.mock('../lib/useBreakpoint', () => ({
  useBreakpoint: () => ({ width: 1280, current: 'xl', sm: true, md: true, lg: true, xl: true }),
}))

const routes = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': () => <Text>HOME</Text>,
  '(tabs)/workouts/index': () => <Text>WORKOUTS</Text>,
  '(tabs)/programs/index': () => <Text>PROGRAMS</Text>,
  '(tabs)/nutrition/index': () => <Text>NUTRITION</Text>,
  '(tabs)/weight/index': () => <Text>WEIGHT</Text>,
  '(tabs)/settings/index': () => <Text>SETTINGS</Text>,
}

it('keeps the bottom tabs on native at a desktop width', async () => {
  expect(Platform.OS).toBe('ios')
  await renderRouter(routes, { initialUrl: '/' })

  expect(screen.getByText('HOME')).toBeTruthy()
  for (const label of ['Home', 'Workouts', 'Programs', 'Nutrition', 'Weight']) {
    expect(screen.getByLabelText(new RegExp(`^${label}, tab`))).toBeTruthy()
  }
  expect(screen.queryByText('lyftr')).toBeNull()
  expect(screen.queryByText('Skip to content')).toBeNull()
  expect(screen.queryByLabelText(/user menu/)).toBeNull()
})
