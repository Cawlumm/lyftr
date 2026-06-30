import { useCallback, useEffect } from 'react'
import { Pause, Minus, Plus, SkipForward, Check } from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from '../hooks/useCountdown'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// Slim, solid rest-timer bar. Mounted once at the app shell at a high z-index so
// it shows over the gym overlay AND on any other screen (when gym is minimized),
// so the "rest over" alert is visible regardless of where you are in the app.
// (Haptics are intentionally left to a future native app — the web Vibration API
// doesn't work on iOS Safari.)
export default function RestTimerBanner() {
  const { restEndsAt, restDurationSec, adjustRest, clearRest } = useWorkoutSession()
  const left = useCountdown(restEndsAt)
  const done = left === 0

  // Smoothly drain the progress line over the *actual* remaining time (one linear
  // CSS transition), instead of stepping every second. A callback ref (not an
  // effect) so it fires on the real mount — the bar only renders a render *after*
  // restEndsAt is set (once the countdown has a value), which an effect keyed on
  // restEndsAt would miss. Re-armed when the ref callback changes (start + ±15s).
  const setupLine = useCallback((el: HTMLDivElement | null) => {
    if (!el || restEndsAt == null) return
    const total = Math.max(1, (restDurationSec ?? 0) * 1000)
    const remaining = Math.max(0, restEndsAt - Date.now())
    el.style.transition = 'none'
    el.style.width = `${Math.min(100, (remaining / total) * 100)}%`
    void el.offsetWidth // reflow so the next change animates from here
    el.style.transition = `width ${remaining}ms linear`
    el.style.width = '0%'
  }, [restEndsAt, restDurationSec])

  // Auto-dismiss a couple seconds after "rest over".
  useEffect(() => {
    if (restEndsAt == null || !done) return
    const id = setTimeout(() => clearRest(), 3000)
    return () => clearTimeout(id)
  }, [restEndsAt, done, clearRest])

  if (restEndsAt == null || left == null) return null

  const step = 'flex items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-surface-muted border border-surface-border text-tx-secondary active:scale-95'

  return (
    <>
      {/* dim everything behind the bar to focus on the rest countdown (visual
          only — taps still pass through so you can set up your next set) */}
      <div className="fixed inset-0 z-[65] bg-black/40 animate-fade-in pointer-events-none" aria-hidden />
      <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
        <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden shadow-lg">
          {/* count-down line */}
          {done ? (
            <div className="h-1.5 bg-success-500" />
          ) : (
            <div className="h-1.5 bg-surface-muted">
              <div ref={setupLine} className="h-full rounded-r-full bg-brand-500" />
            </div>
          )}
          <div className="flex items-center gap-2.5 px-4 py-3">
            {done
              ? <Check className="w-5 h-5 text-success-500 flex-shrink-0" />
              : <Pause className="w-5 h-5 text-brand-500 flex-shrink-0" />}
            <span className="text-lg font-black tabular-nums text-tx-primary leading-none">{fmt(left)}</span>
            <span className="text-xs text-tx-muted">{done ? 'rest over' : 'rest'}</span>
            <div className="flex-1" />
            {!done && (
              <>
                <button onClick={() => adjustRest(-15)} className={step}><Minus className="w-3.5 h-3.5" />15</button>
                <button onClick={() => adjustRest(15)} className={step}><Plus className="w-3.5 h-3.5" />15</button>
              </>
            )}
            <button onClick={() => clearRest()}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-500 text-white active:scale-95">
              {done ? <><Check className="w-3.5 h-3.5" />Done</> : <><SkipForward className="w-3.5 h-3.5" />Skip</>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
