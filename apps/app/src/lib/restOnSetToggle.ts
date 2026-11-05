import { useSettingsStore, useWorkoutSession } from './lyftr'

// Ticks or un-ticks a set and applies the one rest-timer rule, shared by the list layout
// and Gym Mode. Ticking starts rest (the exercise's own, else the default, else 90s) when
// the timer is not switched off and the length is above zero; un-ticking cancels it only
// if that set is the one resting. Returns whether the set WAS completed before the toggle.
// The settings UI treats an unset rest_enabled as on, so only an explicit false is off.
export function applyRestOnToggle(exIdx: number, setIdx: number): boolean {
  const state = useWorkoutSession.getState()
  const ex = state.session?.exercises[exIdx]
  const wasCompleted = !!ex?.sets[setIdx]?.completed
  state.completeSet(exIdx, setIdx)
  if (!ex) return wasCompleted
  if (wasCompleted) {
    if (state.restExIdx === exIdx && state.restSetIdx === setIdx) state.clearRest()
    return wasCompleted
  }
  const { settings } = useSettingsStore.getState()
  if (settings.rest_enabled === false) return wasCompleted
  const seconds = ex.rest_seconds ?? settings.rest_seconds_default ?? 90
  if (seconds > 0) state.startRest(seconds, exIdx, setIdx)
  return wasCompleted
}
