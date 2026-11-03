import { Stack } from 'expo-router'
import { useTheme } from '../../../src/theme/useTheme'

// Nested stack under the Workouts tab: list → detail (→ forms in later phases).
// contentStyle pins the card background to the app surface so push transitions
// don't flash the platform default white/black — same reason (auth)/_layout pins
// its background, but theme-aware here instead of hard-coded.
export default function WorkoutsLayout() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.base },
      }}
    />
  )
}
