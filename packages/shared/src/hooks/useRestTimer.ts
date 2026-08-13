import { useEffect } from 'react'
import type { createWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from './useCountdown'

type WorkoutSessionHook = ReturnType<typeof createWorkoutSession>

export interface RestTimerState {
  /** A rest panel should be on screen. */
  active: boolean
  paused: boolean
  /** Rest has finished; the panel shows its "rest over" state until auto-dismiss. */
  done: boolean
  /** Whole seconds remaining, 0 once finished. */
  left: number
}

// Derived rest-timer state plus the "rest over" auto-dismiss, shared by the full
// in-workout banner and the minimized session-pill chip so both read one source of
// truth. The dismiss is anchored to the ABSOLUTE end time and clearRest is idempotent,
// so it is safe for more than one consumer to mount this at once — whichever is on
// screen still clears rest on time.
//
// A factory, because the workout-session store is itself created per platform (each
// binds its own storage adapter); the hook takes the bound store rather than importing
// a singleton that does not exist at this layer.
export function createUseRestTimer(useWorkoutSession: WorkoutSessionHook) {
  return function useRestTimer(): RestTimerState {
    const restEndsAt = useWorkoutSession((s) => s.restEndsAt)
    const restPausedRemainingMs = useWorkoutSession((s) => s.restPausedRemainingMs)
    const clearRest = useWorkoutSession((s) => s.clearRest)

    const paused = restPausedRemainingMs != null

    // useCountdown drives the once-a-second re-render (and its never-drifts logic). But
    // the seconds SHOWN are derived from the absolute end time on every render, not from
    // useCountdown's state, because on resume `restEndsAt` is set a render before
    // useCountdown's internal value catches up. Reading that lagging value left
    // `secondsLeft` null for one frame, which flipped `active` false and unmounted the
    // banner — a visible one-frame flash of the screen underneath. Absolute-time
    // derivation has no such gap. (Web carried the lagging version until this moved here.)
    const live = useCountdown(restEndsAt)
    const running = restEndsAt != null ? Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000)) : null
    const secondsLeft = paused ? Math.max(0, Math.ceil(restPausedRemainingMs! / 1000)) : (running ?? live)
    const done = !paused && running === 0

    // A rest panel is showing iff it is parked (paused) or a live end stamp exists. This
    // deliberately does NOT depend on the countdown value, so pause↔resume never blinks
    // the banner out.
    const active = paused || restEndsAt != null

    useEffect(() => {
      if (restEndsAt == null || !done) return
      const id = setTimeout(() => clearRest(), Math.max(0, restEndsAt + 3000 - Date.now()))
      return () => clearTimeout(id)
    }, [restEndsAt, done, clearRest])

    return { active, paused, done, left: secondsLeft ?? 0 }
  }
}
