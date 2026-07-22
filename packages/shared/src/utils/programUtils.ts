// Program day/cycle helpers. Ported verbatim from web/src/utils/programUtils.ts so
// web and mobile share one implementation of the multi-day-program logic.
import type { ActiveSessionExercise, Program, ProgramDay, ProgramExercise } from '../types'

// Workout days only — rest days carry no exercises and can't be "started" or
// "loaded". Used everywhere a picker needs to offer a day to load/start from.
export const workoutDays = (program: Program): ProgramDay[] =>
  (program.days ?? []).filter((d) => !d.is_rest_day)

// The Day due today per the cycle, computed server-side as
// Program.current_day_index: the next workout day after the most recently logged
// one (rest days are never due). Undefined for a program with no days yet.
export const todaysDay = (program: Program): ProgramDay | undefined =>
  (program.days ?? [])[program.current_day_index]

export const dayLabel = (day: ProgramDay, idx: number): string =>
  day.name?.trim() || (day.is_rest_day ? 'Rest Day' : `Day ${idx + 1}`)

// A day is startable/loadable only if it's a workout day that actually has
// exercises — a rest day or an empty day is never "due" and can't seed a session.
// Takes `undefined` directly (as `todaysDay()` returns) so callers don't need a
// separate null-guard before calling this.
export const isDayStartable = (day: ProgramDay | undefined): day is ProgramDay =>
  !!day && !day.is_rest_day && (day.exercises ?? []).length > 0

// Display name for a session started from a specific program day: the plain
// program name for a single-day program (nothing to disambiguate), or
// "Program — Day Label" once there's more than one day to distinguish between.
export const sessionNameForDay = (program: Program, day: ProgramDay): string =>
  (program.days?.length ?? 0) > 1 ? `${program.name} — ${dayLabel(day, day.order_index)}` : program.name

export const programExerciseCount = (program: Program): number =>
  (program.days ?? []).reduce((s, d) => s + (d.exercises ?? []).length, 0)

export const programSetCount = (program: Program): number =>
  (program.days ?? []).reduce((s, d) => s + (d.exercises ?? []).reduce((s2, e) => s2 + (e.sets ?? []).length, 0), 0)

// Flattened, so the auto-progression review banner surfaces a suggestion no matter
// which day it landed on (the user may not have that day selected/expanded when it
// lands).
export const allExercises = (program: Program): ProgramExercise[] =>
  (program.days ?? []).flatMap((d) => d.exercises ?? [])

// Builds a live ActiveSession's exercises from one program Day, linking each set
// back to its ProgramSet id so finishing the workout can auto-progress that
// specific target (#40).
export function activeSessionExercisesForDay(day: ProgramDay): ActiveSessionExercise[] {
  return (day.exercises ?? []).map((ex) => ({
    exercise_id: ex.exercise_id,
    exercise: ex.exercise,
    notes: ex.notes || '',
    rest_seconds: ex.rest_seconds,
    sets: (ex.sets ?? []).map((s) => ({
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
