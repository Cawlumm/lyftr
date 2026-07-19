import * as types from '../types'

// buildSessionFromDay maps a program day's exercises into the shape the active workout
// session expects. It preserves the program_set_id linkage so finishing the workout can
// auto-progress the routine's targets (#40). This is the single source of truth for
// "start a workout from a program day" — every start entry point routes through it so a
// multi-day program never accidentally starts every day at once.
export function buildSessionFromDay(day: types.ProgramDay): types.ActiveSessionExercise[] {
  return (day.exercises || []).map(ex => ({
    exercise_id: ex.exercise_id,
    exercise: ex.exercise,
    notes: ex.notes || '',
    rest_seconds: ex.rest_seconds,
    sets: (ex.sets || []).map(s => ({
      set_number: s.set_number,
      target_reps: s.target_reps,
      target_weight: s.target_weight,
      actual_reps: s.target_reps,
      actual_weight: s.target_weight,
      completed: false,
      program_set_id: s.id,
    })),
  }))
}

// trainingDays returns a program's non-rest days in order.
export function trainingDays(program: types.Program): types.ProgramDay[] {
  return (program.days || []).filter(d => !d.is_rest_day)
}

// sessionNameForDay names a session started from a program day. A multi-day program
// tags the day ("PPL — Push A"); a single-day program just uses the program name.
export function sessionNameForDay(program: types.Program, day: types.ProgramDay): string {
  const training = trainingDays(program)
  if (training.length <= 1) return program.name
  return `${program.name}: ${day.name}`
}
