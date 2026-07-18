import { router } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { IconButton, ListScreenSkeleton } from '../ui'

// Initial-load skeleton for the Workouts list — a thin wrapper over the shared
// ListScreenSkeleton (header · 3 stats · search · card rows). The PageHeader + its
// "Log Workout" action are the REAL controls, live immediately; only the data-shaped
// regions are placeholders.
export function WorkoutsSkeleton() {
  return (
    <ListScreenSkeleton
      title="Workouts"
      subtitle="Track and review your training sessions"
      statCount={3}
      action={
        <IconButton
          icon={Plus}
          label="Log Workout"
          variant="solid"
          size="md"
          onPress={() => router.push('/workouts/new')}
        />
      }
    />
  )
}
