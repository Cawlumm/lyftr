import { ExerciseDetailScreen } from '../../../../src/components/workouts/ExerciseDetailScreen'

// Workouts-tab leaf for the shared exercise-detail screen (reached from workout detail +
// active session). Deep-link back falls to the workouts list. See ExerciseDetailScreen for
// why each tab stack gets its own copy of this route.
export default function WorkoutsExerciseDetail() {
  return <ExerciseDetailScreen backFallback="/workouts" />
}
