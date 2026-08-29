import type { ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

interface Props {
  open: boolean
  title: string
  /** Body copy under the title — what is about to happen, or what will be lost. */
  message: string
  confirmLabel: string
  /** Confirm label while `busy`. Defaults to the confirm label. */
  busyLabel?: string
  cancelLabel?: string
  /** Red confirm button, for anything that destroys something. */
  destructive?: boolean
  /** Small glyph on the confirm button (the page's own verb — a flag, a trash can). */
  icon?: ComponentType<{ className?: string }>
  busy?: boolean
  /** Why the last confirm failed. Keeps the sheet up so the retry is under the same
   *  pointer, instead of dismissing to a banner the user has scrolled away from. */
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

// The confirmation sheet, once. Seven pages had hand-rolled this same portal — same
// scrim, same rounded-top panel, same grabber, same Cancel/confirm pair — and they had
// drifted: some disabled the confirm while busy and some did not, and none of them had
// anywhere to put an error, so a confirm that failed just closed and left the user
// looking at an unchanged list.
//
// Mirrors mobile's ConfirmSheet prop-for-prop, `error` included, so a fix to how a failed
// confirmation behaves is one change on each platform rather than eight.
export default function ConfirmSheet({
  open, title, message, confirmLabel, busyLabel, cancelLabel = 'Cancel',
  destructive = false, icon: Icon, busy = false, error, onConfirm, onCancel,
}: Props) {
  useBodyScrollLock(open)
  useEscapeKey(open, onCancel) // Escape dismisses — always the non-destructive choice.
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
        <h3 className="font-display font-bold text-lg text-tx-primary mb-1">{title}</h3>
        <p className="text-sm text-tx-muted mb-5">{message}</p>

        {error && (
          <div className="alert-error mb-5" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-3 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5 ${
              destructive ? 'bg-error-500 hover:bg-error-600' : 'bg-brand-500 hover:bg-brand-600'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
