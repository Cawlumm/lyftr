export const MAX_SECONDARY_MUSCLES = 10

export interface CustomExerciseValues {
  name: string
  muscle: string | null
}

export interface CustomExerciseErrors {
  name?: 'required' | 'controlChars'
  muscle?: 'required'
}

// What a custom exercise needs before it can be sent, held to what the server checks
// (backend/controllers/exercises.go: a name without control characters). The cap on other
// muscles is the picker's `max`, from MAX_SECONDARY_MUSCLES, so it never needs an error here.
// The form and its tests share this.
export function validateCustomExercise({ name, muscle }: CustomExerciseValues): CustomExerciseErrors {
  const errors: CustomExerciseErrors = {}
  if (!name.trim()) errors.name = 'required'
  else if (/\p{Cc}/u.test(name)) errors.name = 'controlChars'
  if (!muscle) errors.muscle = 'required'
  return errors
}
