import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ToastVariant = 'default' | 'success' | 'brand' | 'warning' | 'error'

interface Props {
  title: string
  description?: string
  icon?: LucideIcon
  variant?: ToastVariant
  /** When set, the body is tappable (a chevron affordance is shown). */
  onClick?: () => void
  onDismiss: () => void
  /** Auto-dismiss delay; pass 0 to keep it until dismissed. Default 4s. */
  autoDismissMs?: number
}

// Semantic colour applied only to the icon chip + border, keeping the text in the
// normal tx-* hierarchy — a fully tinted toast reads as obnoxious over content.
const VARIANTS: Record<ToastVariant, { border: string; chip: string; icon: string }> = {
  default: { border: 'border-surface-border',   chip: 'bg-surface-muted border-surface-border',   icon: 'text-tx-secondary' },
  success: { border: 'border-success-500/20',   chip: 'bg-success-500/10 border-success-500/20',   icon: 'text-success-400' },
  brand:   { border: 'border-brand-500/20',     chip: 'bg-brand-500/10 border-brand-500/20',       icon: 'text-brand-400' },
  warning: { border: 'border-warning-500/20',   chip: 'bg-warning-500/10 border-warning-500/20',   icon: 'text-warning-400' },
  error:   { border: 'border-error-500/20',     chip: 'bg-error-500/10 border-error-500/20',       icon: 'text-error-400' },
}

// A dismissible floating toast — the app's shared transient notification. Sits at
// bottom-24 to clear the nav; callers that fire it after a session ends don't
// collide with session-gated UI.
export default function Toast({ title, description, icon: Icon, variant = 'default', onClick, onDismiss, autoDismissMs = 4000 }: Props) {
  // Armed once on mount — parent re-renders must not extend the window (0 disables).
  useEffect(() => {
    if (!autoDismissMs) return
    const id = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const v = VARIANTS[variant]
  const body = (
    <>
      {Icon && (
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${v.chip}`}>
          <Icon className={`w-4 h-4 ${v.icon}`} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tx-primary leading-tight">{title}</p>
        {description && <p className="text-xs text-tx-muted leading-tight truncate">{description}</p>}
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />}
    </>
  )

  // Portal to <body>: a page root with a lingering transform (animate-slide-up)
  // would otherwise become the containing block for this position:fixed toast and
  // shove it off-screen. The portal gives us a true viewport anchor.
  return createPortal(
    <div role="status" className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
      <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 bg-surface-raised border shadow-lg ${v.border}`}>
        {onClick ? (
          <button type="button" onClick={onClick} className="flex items-center gap-3 min-w-0 flex-1 text-left">
            {body}
          </button>
        ) : (
          <div className="flex items-center gap-3 min-w-0 flex-1">{body}</div>
        )}
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
