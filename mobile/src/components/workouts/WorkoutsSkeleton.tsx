import { router } from 'expo-router'
import { useTranslation } from '@lyftr/shared'
import { Plus } from 'lucide-react-native'
import { IconButton, ListScreenSkeleton } from '../ui'

// Initial-load skeleton for the Workouts list — a thin wrapper over the shared
// ListScreenSkeleton (header · 3 stats · search · card rows). The PageHeader + its
// "Log Workout" action are the REAL controls, live immediately; only the data-shaped
// regions are placeholders.
export function WorkoutsSkeleton() {
  const { t } = useTranslation()
  return (
    <ListScreenSkeleton
      title={t('workouts.list.title')}
      subtitle={t('workouts.list.subtitle')}
      statCount={3}
      action={
        <IconButton
          icon={Plus}
          label={t('workouts.list.logWorkout')}
          variant="solid"
          size="md"
          onPress={() => router.push('/workouts/new')}
        />
      }
    />
  )
}
