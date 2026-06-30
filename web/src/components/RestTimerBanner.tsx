import { useEffect } from 'react'
import { Pause, Minus, Plus, SkipForward, Check } from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from '../hooks/useCountdown'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// Slim, solid rest-timer bar. Mounted once at the app shell at a high z-index so
// it shows over the gym overlay AND on any other screen (when gym is minimized),
// and so the "rest over" alert fires from a single instance (no double-buzz).
export default function RestTimerBanner() {
  const { restEndsAt, restDurationSec, adjustRest, clearRest } = useWorkoutSession()
  const left = useCountdown(restEndsAt, () => navigator.vibrate?.([120, 60, 120]))

  // Auto-dismiss a couple seconds after "rest over".
  const done = left === 0
  useEffect(() => {
    if (restEndsAt == null || !done) return
    const id = setTimeout(() => clearRest(), 3000)
    return () => clearTimeout(id)
  }, [restEndsAt, done, clearRest])

  if (restEndsAt == null || left == null) return null

  const frac = done ? 1 : restDurationSec ? Math.max(0, Math.min(1, left / restDurationSec)) : 0
  const step = 'flex items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-surface-muted border border-surface-border text-tx-secondary active:scale-95'

  return (
    <>
      {/* dim everything behind the bar to focus on the rest countdown (visual
          only — taps still pass through so you can set up your next set) */}
      <div className="fixed inset-0 z-[65] bg-black/40 animate-fade-in pointer-events-none" aria-hidden />
      <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
      <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden shadow-lg">
        {/* progress line */}
        <div className="h-1 bg-surface-muted">
          <div className={`h-full transition-[width] duration-300 ease-linear ${done ? 'bg-success-500' : 'bg-brand-500'}`} style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          {done
            ? <Check className="w-4 h-4 text-success-500 flex-shrink-0" />
            : <Pause className="w-4 h-4 text-brand-500 flex-shrink-0" />}
          <span className="font-bold tabular-nums text-tx-primary">{fmt(left)}</span>
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
