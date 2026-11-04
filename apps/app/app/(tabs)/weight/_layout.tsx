import { Stack } from 'expo-router'
import { useTheme } from '../../../src/theme/useTheme'

// Nested stack under the Weight tab: list → detail. contentStyle pins the card
// background to the app surface so push transitions don't flash the platform
// default — same rationale as the workouts stack.
export default function WeightLayout() {
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
