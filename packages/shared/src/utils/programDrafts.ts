// Day-cycle editing for the program form: add, remove, reorder and patch the days of a
// program draft. Both apps' ProgramDaysEditor had its own copy of all five.
//
// Generic over the day type rather than importing a concrete draft, because the two
// editors' *set* drafts still disagree on field names — web uses target_reps/
// target_weight (matching the backend), mobile uses reps/weight and maps at submit.
// None of the operations below touch sets, so the difference is irrelevant here and
// this shares the logic without forcing that rename.
//
// All five are pure: they take the current days and return the next array. The
// component keeps its own `expanded` bookkeeping, which is UI state, not data.

export interface DayLike {
  order_index: number
  is_rest_day: boolean
  name: string
  exercises: unknown[]
}

// order_index is positional and must always match the array order — the server matches
// days by it, so a reorder that skipped this would re-attribute logged workouts.
export const reindexDays = <T extends { order_index: number }>(days: T[]): T[] =>
  days.map((d, i) => ({ ...d, order_index: i }))

export const appendDay = <T extends DayLike>(days: T[], isRest: boolean): T[] =>
  reindexDays([
    ...days,
    { order_index: days.length, is_rest_day: isRest, name: '', exercises: [] } as unknown as T,
  ])

export const removeDayAt = <T extends DayLike>(days: T[], idx: number): T[] =>
  reindexDays(days.filter((_, i) => i !== idx))

// Swap with the neighbour in `dir`. Returns the array unchanged when the move would
// fall off either end, so the caller can compare identity to know nothing happened.
export const moveDayBy = <T extends DayLike>(days: T[], idx: number, dir: -1 | 1): T[] => {
  const target = idx + dir
  if (target < 0 || target >= days.length) return days
  const next = [...days]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return reindexDays(next)
}

export const patchDayAt = <T extends DayLike>(days: T[], idx: number, patch: Partial<T>): T[] => {
  const next = [...days]
  next[idx] = { ...next[idx], ...patch }
  return next
}
