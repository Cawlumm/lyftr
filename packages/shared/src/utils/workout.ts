import type { Set, Workout, WorkoutExercise } from '../types'

// Training volume = Σ reps × weight, in lbs.
//
// Two things this fixes relative to the six reduce() call sites it replaces:
//
// 1. Warm-up sets are excluded, matching the backend. backend/stores/workout.go
//    computes `SUM(s.reps * s.weight) ... AND s.is_warmup = 0`, while every client
//    call site summed unfiltered. Nothing writes is_warmup yet, so every row is 0 and
//    the two agree today — which is exactly why this is the safe moment to align them.
//    The day warm-up logging ships, the clients would otherwise start disagreeing with
//    the server on a number shown on the dashboard.
//
// 2. reps/weight are coerced. A set with a missing field makes the product NaN, which
//    poisons the whole sum: web silently drops NaN chart geometry, but on native it is
//    a hard react-native-svg crash. Mobile had this guard, web did not.
const setVolume = (s: Set): number =>
  s.is_warmup ? 0 : (Number(s.reps) || 0) * (Number(s.weight) || 0)

export const exerciseVolume = (sets: Set[] | undefined | null): number =>
  (sets ?? []).reduce((total, s) => total + setVolume(s), 0)

export const calcVolume = (w: Pick<Workout, 'exercises'> | undefined | null): number =>
  (w?.exercises ?? []).reduce(
    (total: number, ex: WorkoutExercise) => total + exerciseVolume(ex.sets),
    0,
  )
