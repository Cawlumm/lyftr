export const MAX_SECONDARY_MUSCLES = 10

export interface CustomExerciseValues {
  name: string
  muscle: string | null
  secondary?: readonly string[]
}

export interface CustomExerciseErrors {
  name?: 'required' | 'controlChars'
  muscle?: 'required'
  secondary?: 'tooMany'
}

// What a custom exercise needs before it can be sent, held to what the server checks
// (backend/controllers/exercises.go: a name without control characters, at most 10 other
// muscles). The form and its tests share this.
export function validateCustomExercise({ name, muscle, secondary = [] }: CustomExerciseValues): CustomExerciseErrors {
  const errors: CustomExerciseErrors = {}
  if (!name.trim()) errors.name = 'required'
  else if (/\p{Cc}/u.test(name)) errors.name = 'controlChars'
  if (!muscle) errors.muscle = 'required'
  if (secondary.length > MAX_SECONDARY_MUSCLES) errors.secondary = 'tooMany'
  return errors
}
