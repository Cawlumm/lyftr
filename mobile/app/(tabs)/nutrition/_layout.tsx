import { Stack } from 'expo-router'
import { useTheme } from '../../../src/theme/useTheme'

// Nested stack under the Nutrition tab: daily dashboard (index) → log/edit flow (log).
// contentStyle pins the card background to the app surface so push transitions don't
// flash the platform default — same rationale as the weight/workouts stacks.
export default function NutritionLayout() {
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
