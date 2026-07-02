import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, ChevronRight, X } from 'lucide-react'

// Flash toast shown on /workouts after finishing a routine-based workout that beat
// per-set targets (the backend auto-progressed them — issue #40). Celebratory but
// quiet: the app's "win" green is confined to the icon chip + border, text uses the
// normal tx-* hierarchy. Floats in the same slot as the floating RestTimerBanner
// (bottom-24 clears the bottom nav); nothing collides because the session just
// ended, so the rest banner + active-session pill aren't rendered. Tapping the body
// opens the routine to review/tweak the new targets; the X (or the 4s timeout)
// dismisses. Both are large tap targets.
interface Props {
  count: number
  programId: number
  routineName: string
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 4000

export default function ProgressionToast({ count, programId, routineName, onDismiss }: Props) {
  const navigate = useNavigate()

  // Armed once on mount — parent re-renders must not extend the 4s window.
  useEffect(() => {
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openRoutine = () => {
    onDismiss()
    navigate(`/programs/${programId}`)
  }

  // Portal to <body>: rendered from a page whose root carries animate-slide-up (a
  // lingering transform), which would otherwise become the containing block for a
  // position:fixed child and push the toast off-screen. The floating RestTimerBanner
  // dodges this by mounting from Layout; a portal gives us the same viewport anchor.
  return createPortal(
    <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-surface-raised border border-success-500/20 shadow-lg">
        {/* Body opens the routine; role=status announces it without stealing focus. */}
        <button
          type="button"
          role="status"
          onClick={openRoutine}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <div className="w-8 h-8 rounded-full bg-success-500/10 border border-success-500/20 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-success-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tx-primary leading-tight">
              Progressed {count} {count === 1 ? 'target' : 'targets'}
            </p>
            <p className="text-xs text-tx-muted leading-tight truncate">
              Tap to view {routineName}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="p-1.5 -m-1.5 text-tx-muted hover:text-tx-primary flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  )
}
