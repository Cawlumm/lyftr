import { Stack } from 'expo-router'
import { useTheme } from '../../../src/theme/useTheme'

// Nested stack under Settings: list → change password. Same shape and same reason as the
// workouts and weight stacks — contentStyle pins the card background to the app surface so
// the push transition doesn't flash the platform default.
export default function SettingsLayout() {
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
