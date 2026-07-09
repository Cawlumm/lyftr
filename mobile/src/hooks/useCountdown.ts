import { useEffect, useRef, useState } from 'react'

// Port of web/src/hooks/useCountdown.ts — pure JS/timers, unchanged for RN.
// Counts down to an absolute epoch-ms timestamp. Timestamp-based (recomputed each
// tick, never decremented) so it never drifts and survives component re-mounts and
// JS-timer pauses (backgrounding) — on foreground the next tick recomputes from
// `endsAt`. Returns whole seconds remaining (>= 0), or null when `endsAt` is null.
// Fires `onComplete` exactly once when it first reaches 0.
export function useCountdown(endsAt: number | null, onComplete?: () => void): number | null {
  const [left, setLeft] = useState<number | null>(() =>
    endsAt == null ? null : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
  )
  const fired = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    fired.current = false
    if (endsAt == null) {
      setLeft(null)
      return
    }
    const tick = () => {
      const l = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setLeft(l)
      if (l === 0 && !fired.current) {
        fired.current = true
        onCompleteRef.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 300)
    return () => clearInterval(id)
  }, [endsAt])

  return left
}
