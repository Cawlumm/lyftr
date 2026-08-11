import { useEffect, useState } from 'react'

// Whole seconds since an ISO timestamp, ticking once a second. Used by every surface
// that shows how long the current workout has been running (the session pill, the
// active-workout header) on both platforms.
//
// Recomputed from the absolute start on every tick rather than incremented, so it
// cannot drift and it is correct again immediately after the JS timer is throttled or
// suspended — a backgrounded tab, or a phone with the screen off.
//
// Keyed on the timestamp, not the session object: three of the four call sites this
// replaces depended on `[session]`, which rebuilt the interval every time any part of
// the session changed (completing a set, editing a weight). Same displayed value,
// without the churn.
export function useElapsedSeconds(startedAt: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }
    const started = new Date(startedAt).getTime()
    if (Number.isNaN(started)) {
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return elapsed
}
