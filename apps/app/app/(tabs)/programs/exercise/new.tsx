import { CustomExerciseForm } from '../../../../src/components/workouts/CustomExerciseForm'

// programs-tab leaf for the create-exercise page (its own copy per tab, like the detail route, so
// Back stays in this stack).
export default function ProgramsNewExercise() {
  return <CustomExerciseForm mode="create" base="/programs" />
}
