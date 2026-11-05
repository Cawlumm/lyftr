import { useSettingsStore, useWorkoutSession } from '../lib/lyftr'

export type RestDecision = { kind: 'start'; seconds: number } | { kind: 'clear' } | { kind: 'none' }

// The one rule for what ticking a set does to the rest timer, shared by the list layout
// and Gym Mode. Ticking starts rest (the exercise's own, else the default, else 90s) when
// the timer is on and the length is above zero; un-ticking cancels it only if it is the
// set that is resting.
export function decideRest(opts: {
  wasCompleted: boolean
  enabled: boolean | undefined
  exerciseRest: number | null | undefined
  defaultRest: number | undefined
  restingThisSet: boolean
}): RestDecision {
  if (opts.wasCompleted) return opts.restingThisSet ? { kind: 'clear' } : { kind: 'none' }
  if (!opts.enabled) return { kind: 'none' }
  const seconds = opts.exerciseRest ?? opts.defaultRest ?? 90
  return seconds > 0 ? { kind: 'start', seconds } : { kind: 'none' }
}

// Call right after completeSet(exIdx, setIdx), with whether the set WAS completed before.
export function applyRestOnToggle(ex: { rest_seconds?: number | null }, exIdx: number, setIdx: number, wasCompleted: boolean) {
  const { settings } = useSettingsStore.getState()
  const { restExIdx, restSetIdx, startRest, clearRest } = useWorkoutSession.getState()
  const d = decideRest({
    wasCompleted,
    enabled: settings.rest_enabled,
    exerciseRest: ex.rest_seconds,
    defaultRest: settings.rest_seconds_default,
    restingThisSet: restExIdx === exIdx && restSetIdx === setIdx,
  })
  if (d.kind === 'start') startRest(d.seconds, exIdx, setIdx)
  else if (d.kind === 'clear') clearRest()
}
