import { useLocalSearchParams } from 'expo-router'
import { exerciseFilterGroups, parseFilters } from '@lyftr/shared'
import { ExerciseBrowser } from '../../../src/components/workouts/ExerciseBrowser'

// Read-only exercise catalogue, opened from the Workouts list. Lives in the Workouts stack so
// a row opens workouts/exercise/[exerciseId] and back returns here.
//
// The old /exercises?q=&muscle=&equipment= links arrive here through a redirect, so the query
// seeds the filters. In-app navigation passes none, which parses to the empty filters.
export default function WorkoutsExercises() {
  const params = useLocalSearchParams<{ q?: string; muscle?: string; equipment?: string }>()
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
  return (
    <ExerciseBrowser
      initialQuery={first(params.q)?.trim() ?? ''}
      initialFilters={parseFilters(exerciseFilterGroups(), (key) => first(params[key as keyof typeof params]) ?? null)}
    />
  )
}
