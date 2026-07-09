// Port of web/src/utils/workoutSets.ts — keep in sync.

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
