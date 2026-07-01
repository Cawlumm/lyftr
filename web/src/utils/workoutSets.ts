// Index of the first not-completed set after `afterIdx`, or -1 if none. Shared by
// gym-mode auto-advance (which set to focus after completing one) and the rest
// banner's "set N next" label so the two can never drift out of sync.
export function nextIncompleteSet(sets: { completed?: boolean }[], afterIdx: number): number {
  return sets.findIndex((s, i) => i > afterIdx && !s.completed)
}
