import { useEffect } from 'react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useCountdown } from '../hooks/useCountdown'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

const R = 45
const CIRC = 2 * Math.PI * R

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

  // Fraction of rest remaining → the visible arc (full when fresh, empties to 0).
  const frac = done ? 1 : restDurationSec ? Math.max(0, Math.min(1, left / restDurationSec)) : 0
  const offset = CIRC * (1 - frac)

  return (
    <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-xs animate-slide-up">
      <div className={`rounded-2xl border p-5 shadow-lg backdrop-blur-xl ${done ? 'bg-success-500/15 border-success-500/30' : 'bg-surface-raised/95 border-surface-border'}`}>
        <p className={`text-center text-sm font-semibold mb-3 ${done ? 'text-success-400' : 'text-brand-400'}`}>
          {done ? 'Rest over' : 'Rest'}
        </p>

        <div className="relative w-28 h-28 mx-auto">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="7" stroke="currentColor" className="text-surface-muted" />
            <circle
              cx="50" cy="50" r={R} fill="none" strokeWidth="7" strokeLinecap="round" stroke="currentColor"
              className={`${done ? 'text-success-500' : 'text-brand-500'} transition-[stroke-dashoffset] duration-300 ease-linear`}
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-black tabular-nums text-tx-primary">{fmt(left)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
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
