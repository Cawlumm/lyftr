import { router } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { IconButton, ListScreenSkeleton } from '../ui'

// Initial-load skeleton for the Programs list — a thin wrapper over the shared
// ListScreenSkeleton (header · 2 stats · search · card rows), matching the Programs
// layout so content fills into its own shape rather than popping after a blank/spinner.
// The PageHeader + its "New Program" action are the REAL controls, live immediately;
// only the data-shaped regions are placeholders. Mirrors WorkoutsSkeleton.
export function ProgramsSkeleton() {
  return (
    <ListScreenSkeleton
      title="Programs"
      subtitle="Reusable workout templates"
      statCount={2}
      action={
        <IconButton
          icon={Plus}
          label="New Program"
          variant="solid"
          size="md"
          onPress={() => router.push('/programs/new')}
        />
      }
    />
  )
}
