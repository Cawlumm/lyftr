import { groupOf, roundRest } from '@lyftr/shared'
import { useSettingsStore, useWorkoutSession } from './lyftr'

// Ticks or un-ticks a set and applies the one rest-timer rule, shared by the list layout
// and Gym Mode, and the only caller of roundRest. Ticking starts rest only once the set's
// round is complete (an exercise outside a superset is a round of one): the length is the
// round's source member's own, else the default, else 90s, unless the timer is switched off
// or the length is zero. Un-ticking any set of the round whose rest is running cancels it.
// Returns whether the set WAS completed before the toggle.
// The settings UI treats an unset rest_enabled as on, so only an explicit false is off.
export function applyRestOnToggle(exIdx: number, setIdx: number): boolean {
  const before = useWorkoutSession.getState()
  const wasCompleted = !!before.session?.exercises[exIdx]?.sets[setIdx]?.completed
  before.completeSet(exIdx, setIdx)
  // completeSet replaces the session, so anything read above is stale from here on.
  const state = useWorkoutSession.getState()
  const exercises = state.session?.exercises
  if (!exercises?.[exIdx]) return wasCompleted
  if (wasCompleted) {
    if (state.restSetIdx === setIdx && state.restExIdx != null) {
      const g = groupOf(exercises, exIdx)
      const inRound = g ? state.restExIdx >= g.start && state.restExIdx <= g.end : state.restExIdx === exIdx
      if (inRound) state.clearRest()
    }
    return wasCompleted
  }
  const { settings } = useSettingsStore.getState()
  if (settings.rest_enabled === false) return wasCompleted
  const round = roundRest(exercises, exIdx, setIdx)
  if (!round.rest) return wasCompleted
  const seconds = exercises[round.sourceExIdx]?.rest_seconds ?? settings.rest_seconds_default ?? 90
  if (seconds > 0) state.startRest(seconds, exIdx, setIdx)
  return wasCompleted
}
