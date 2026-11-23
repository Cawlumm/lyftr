import { stepsToText } from '@lyftr/shared'

export const MAX_SECONDARY_MUSCLES = 10
// The server's limits on instructions (backend/models/steps.go), counted in characters as it does.
export const MAX_STEPS = 30
export const MAX_STEP_LENGTH = 300
export const MAX_STEPS_TEXT = 2000

export interface CustomExerciseValues {
  name: string
  muscle: string | null
  /** The steps as typed; blank ones are dropped before they are counted, as on save. */
  steps?: readonly string[]
}

export interface CustomExerciseErrors {
  name?: 'required' | 'controlChars'
  muscle?: 'required'
  steps?: 'stepTooLong' | 'textTooLong'
}

// What a custom exercise needs before it can be sent, held to what the server checks
// (backend/controllers/exercises.go: a name without control characters, steps within the
// length limits; the step count is the editor's own cap). The cap on other
// muscles is the picker's `max`, from MAX_SECONDARY_MUSCLES, so it never needs an error here.
// The form and its tests share this.
const chars = (s: string) => [...s].length

export function validateCustomExercise({ name, muscle, steps = [] }: CustomExerciseValues): CustomExerciseErrors {
  const errors: CustomExerciseErrors = {}
  if (!name.trim()) errors.name = 'required'
  else if (/\p{Cc}/u.test(name)) errors.name = 'controlChars'
  const kept = steps.map((x) => x.trim()).filter(Boolean)
  if (kept.some((x) => chars(x) > MAX_STEP_LENGTH)) errors.steps = 'stepTooLong'
  else if (chars(stepsToText(kept)) > MAX_STEPS_TEXT) errors.steps = 'textTooLong'
  if (!muscle) errors.muscle = 'required'
  return errors
}
