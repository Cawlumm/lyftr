import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

interface Props {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
}

// Discard-workout confirmation bottom sheet, shared by every gym-mode phase (was
// triplicated inline). Renders to document.body so it overlays the full-screen gym;
// uses the shared escape/scroll-lock hooks like every other sheet.
export default function DiscardConfirm({ open, onKeep, onDiscard }: Props) {
  useBodyScrollLock(open)
  useEscapeKey(open, onKeep) // Escape dismisses (the non-destructive choice)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
        <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
        <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Discard workout?</h3>
        <p className="text-sm text-tx-muted mb-5">This ends the workout without saving — all progress is lost.</p>
        <div className="flex gap-3">
          <button onClick={onKeep} className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm">Keep Going</button>
          <button onClick={onDiscard} className="flex-1 py-3 bg-error-500 hover:bg-error-600 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />Discard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
