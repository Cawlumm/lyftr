import { ExerciseBrowser } from '../../../src/components/workouts/ExerciseBrowser'

// Read-only exercise catalogue, opened from the Workouts list. Lives in the Workouts stack so
// a row opens workouts/exercise/[exerciseId] and back returns here.
export default function WorkoutsExercises() {
  return <ExerciseBrowser />
}
