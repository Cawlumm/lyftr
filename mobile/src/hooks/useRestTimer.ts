import { useEffect } from 'react'
import { useWorkoutSession } from '../lib/lyftr'
import { useCountdown } from './useCountdown'

// Port of web/src/hooks/useRestTimer.ts (import points at the mobile store).
// Derived rest-timer state (seconds left, paused/done flags) + the "rest over"
// auto-dismiss, shared by the full in-workout banner and the minimized session-pill
// chip so both read one source of truth. The dismiss is anchored to the ABSOLUTE end
// time and clearRest is idempotent, so it's safe for more than one consumer to mount
// this at once — whichever is on screen (banner or pill) still clears rest on time.
export function useRestTimer() {
  const restEndsAt = useWorkoutSession((s) => s.restEndsAt)
  const restPausedRemainingMs = useWorkoutSession((s) => s.restPausedRemainingMs)
  const clearRest = useWorkoutSession((s) => s.clearRest)
  const paused = restPausedRemainingMs != null
  // useCountdown drives the once-a-second re-render (and its onComplete/never-drifts
  // logic). But we DERIVE the seconds shown from the absolute end time on every render —
  // not from useCountdown's state — because on resume `restEndsAt` is set a render before
  // useCountdown's internal value catches up. Reading that lagging value left `secondsLeft`
  // null for one frame, which flipped `active` false and unmounted the banner (a visible
  // one-frame flash of the screen underneath). Absolute-time derivation has no such gap.
  const live = useCountdown(restEndsAt)
  const running = restEndsAt != null ? Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000)) : null
  const secondsLeft = paused ? Math.max(0, Math.ceil(restPausedRemainingMs! / 1000)) : (running ?? live)
  const done = !paused && running === 0
  // A rest sheet is showing iff it's parked (paused) or a live end stamp exists. This does
  // NOT depend on the countdown value, so pause↔resume never blinks the banner out.
  const active = paused || restEndsAt != null

  useEffect(() => {
    if (restEndsAt == null || !done) return
    const id = setTimeout(() => clearRest(), Math.max(0, restEndsAt + 3000 - Date.now()))
    return () => clearTimeout(id)
  }, [restEndsAt, done, clearRest])

  return { active, paused, done, left: secondsLeft ?? 0 }
}
