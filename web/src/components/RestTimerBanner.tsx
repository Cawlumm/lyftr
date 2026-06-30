import { useEffect } from 'react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from '../hooks/useCountdown'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// Floating rest-timer banner. Mounted once at the app shell at a high z-index so
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

  const pct = restDurationSec ? Math.max(0, Math.min(100, (left / restDurationSec) * 100)) : 0

  return (
    <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
      <div className={`rounded-xl border p-4 shadow-lg backdrop-blur-xl ${done ? 'bg-success-500/15 border-success-500/30' : 'bg-brand-500/15 border-brand-500/30'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-semibold ${done ? 'text-success-400' : 'text-brand-400'}`}>
            {done ? 'Rest over' : 'Rest'}
          </span>
          <span className="text-3xl font-black tabular-nums text-tx-primary">{fmt(left)}</span>
        </div>
        {!done && (
          <div className="h-1 rounded-full bg-surface-muted overflow-hidden mb-3">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => adjustRest(-15)} disabled={done}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-muted border border-surface-border text-tx-secondary disabled:opacity-40">−15s</button>
          <button onClick={() => adjustRest(15)} disabled={done}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-muted border border-surface-border text-tx-secondary disabled:opacity-40">+15s</button>
          <button onClick={() => clearRest()}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white">{done ? 'Done' : 'Skip'}</button>
        </div>
      </div>
    </div>
  )
}
