// Format whole seconds as m:ss (e.g. 90 → "1:30"). Shared by the rest banner and
// the minimized session-pill chip.
export function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  return `${m}:${String(totalSeconds % 60).padStart(2, '0')}`
}

// Index of the first not-completed set after `afterIdx`, or -1 if none. Shared by
// gym-mode auto-advance (which set to focus after completing one) and the rest
// banner's "set N next" label so the two can never drift out of sync.
export function nextIncompleteSet(sets: { completed?: boolean }[], afterIdx: number): number {
  return sets.findIndex((s, i) => i > afterIdx && !s.completed)
}

// Elapsed time for a running workout: h:mm:ss once past an hour, mm:ss below it.
// Both parts are zero-padded — unlike fmtClock, which leaves the minute bare. That is
// deliberate: this one sits in a fixed-width slot (the session pill, the active-workout
// header) where an unpadded minute makes the digits jump as it ticks past 9:59.
export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Rest interval as a compact label: whole minutes collapse to "2m", anything else
// stays in seconds ("90s"). Shown on program and workout set rows.
export const restLabel = (s: number): string => (s % 60 === 0 && s >= 60 ? `${s / 60}m` : `${s}s`)

// "8", "8–12", or an em dash when there's nothing to show. Used for the planned
// reps/weight spread across an exercise's sets in gym mode.
export const numericRange = (values: number[]): string => {
  if (values.length === 0) return '—'
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return lo === hi ? String(lo) : `${lo}–${hi}`
}
