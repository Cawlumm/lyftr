import { Stack } from 'expo-router'
import { useTheme } from '../../../src/theme/useTheme'

// Nested stack under the Programs tab: list → detail → new / edit. Mirrors the
// Workouts stack: header hidden (screens draw their own back row) and the card
// background pinned to the app surface so push transitions don't flash the
// platform default.
export default function ProgramsLayout() {
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
