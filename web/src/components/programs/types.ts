// Local draft shapes for the program day/exercise editors — mirror
// CreateProgramDayReq/CreateProgramExerciseReq (backend/models/models.go) but keep
// weights in the user's display unit until submit (see displayToLbs conversion at
// save time in AddProgram/EditProgram).
export interface DaySetDraft {
  set_number: number
  target_reps: number
  target_weight: number
}

export interface DayExerciseDraft {
  exercise_id: number
  notes: string
  rest_seconds: number
  sets: DaySetDraft[]
}

export interface DayDraft {
  order_index: number
  is_rest_day: boolean
  name: string
  exercises: DayExerciseDraft[]
}
