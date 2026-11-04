import { Stack } from 'expo-router'

// Which screen a signed-out user lands on is declared, not inherited from file ordering.
// When the (tabs) guard closes, expo-router sends the user to the first route in this
// group — and "first" is decided by `sortRoutes`, whose final tiebreak is route-name
// LENGTH (`a.route.length - b.route.length`), not alphabetical. 'login' only wins today
// because it is shorter than 'register'; adding an `sso.tsx` would silently make that the
// sign-in screen. `anchor` pins it (expo-router v6's name for initialRouteName), and also
// gives /register a login screen underneath it so Back behaves.
export const unstable_settings = { anchor: 'login' }

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#070d1a' },
      }}
    />
  )
}
