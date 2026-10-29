import { Text } from 'react-native'
import { router } from 'expo-router'
import { renderRouter, screen, act } from 'expo-router/testing-library'
import TabsLayout from '../../app/(tabs)/_layout'

// Settings has no tab of its own; it is opened from the avatar on Home. SDK 58 made a tab
// declared with `href: null` hidden *and unreachable*, so the avatar silently went nowhere.
// This renders the real (tabs) layout and navigates the way the avatar does.
jest.mock('../theme/useTheme', () => ({
  useTheme: () => ({
    colors: { raised: '#fff', border: '#ddd', txMuted: '#999' },
    brand: { cyan: '#0bc' },
  }),
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

it('opens Settings from Home, without giving it a tab', async () => {
  await renderRouter(routes, { initialUrl: '/' })
  expect(screen.getByText('HOME')).toBeTruthy()

  await act(async () => { router.push('/settings') })

  expect(screen.getByText('SETTINGS')).toBeTruthy()
  expect(screen.queryByText('HOME')).toBeNull()
  expect(screen.queryByText('nav.settings')).toBeNull()
})
