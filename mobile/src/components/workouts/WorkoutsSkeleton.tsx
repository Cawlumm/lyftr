import { View } from 'react-native'
import { router } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { IconButton, PageHeader, Screen, Skeleton, SkeletonList, SkeletonStatRow } from '../ui'

// Initial-load skeleton for the Workouts list — a thin composition of the reusable
// ui/ skeleton primitives, laid out 1:1 with the real screen (header · stat row ·
// search bar · card rows) so content fills in rather than popping after a blank
// spinner. The PageHeader + its "Log Workout" action are the REAL controls, live
// immediately; only the data-shaped regions are placeholders.
export function WorkoutsSkeleton() {
  return (
    <Screen>
      <View className="gap-5 py-4">
        <PageHeader
          title="Workouts"
          subtitle="Track and review your training sessions"
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
        <SkeletonStatRow count={3} />
        <Skeleton height={48} radius={8} />
      </View>
      <SkeletonList count={6} />
    </Screen>
  )
}
