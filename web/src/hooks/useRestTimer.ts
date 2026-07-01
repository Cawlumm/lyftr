import { useEffect } from 'react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from './useCountdown'

// Derived rest-timer state (seconds left, paused/done flags) + the "rest over"
// auto-dismiss, shared by the full in-workout banner and the minimized session-pill
// chip so both read one source of truth. The dismiss is anchored to the ABSOLUTE end
// time and clearRest is idempotent, so it's safe for more than one consumer to mount
// this at once — whichever is on screen (banner or pill) still clears rest on time.
export function useRestTimer() {
  const { restEndsAt, restPausedRemainingMs, clearRest } = useWorkoutSession()
  const paused = restPausedRemainingMs != null
  const live = useCountdown(restEndsAt)
  // While paused, restEndsAt is null (live === null) — show the parked remaining time.
  const secondsLeft = paused ? Math.max(0, Math.ceil(restPausedRemainingMs! / 1000)) : live
  const done = !paused && live === 0
  const active = !(restEndsAt == null && !paused) && secondsLeft != null

  useEffect(() => {
    if (restEndsAt == null || !done) return
    const id = setTimeout(() => clearRest(), Math.max(0, restEndsAt + 3000 - Date.now()))
    return () => clearTimeout(id)
  }, [restEndsAt, done, clearRest])

  return { active, paused, done, left: secondsLeft ?? 0 }
}
