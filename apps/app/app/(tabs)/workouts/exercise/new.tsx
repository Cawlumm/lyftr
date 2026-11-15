import { CustomExerciseForm } from '../../../../src/components/workouts/CustomExerciseForm'

// workouts-tab leaf for the create-exercise page (its own copy per tab, like the detail route, so
// Back stays in this stack).
export default function WorkoutsNewExercise() {
  return <CustomExerciseForm mode="create" base="/workouts" />
}
