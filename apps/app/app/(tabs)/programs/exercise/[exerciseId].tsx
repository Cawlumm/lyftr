import { ExerciseDetailScreen } from '../../../../src/components/workouts/ExerciseDetailScreen'

// Programs-tab leaf for the shared exercise-detail screen (reached from program detail).
// Its own copy (rather than linking the workouts-tab route) keeps back within the Programs
// stack — cross-tab pushes strand the back stack. Deep-link back falls to the programs list.
export default function ProgramsExerciseDetail() {
  return <ExerciseDetailScreen backFallback="/programs" />
}
