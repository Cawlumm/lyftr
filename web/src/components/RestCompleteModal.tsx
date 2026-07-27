import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2 } from 'lucide-react'
import { useRestTimer } from '../hooks/useRestTimer'
import { useWorkoutSession } from '../stores/workoutSession'
import { playDing } from '../utils/audio'

export default function RestCompleteModal() {
  const { done } = useRestTimer()
  const { clearRest } = useWorkoutSession()
  const [show, setShow] = useState(false)

  // When timer becomes done, play sound and show modal
  useEffect(() => {
    if (done) {
      playDing()
      setShow(true)
    } else {
      setShow(false)
    }
  }, [done])

  if (!show) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-[280px] p-6 shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-12 h-12 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="font-display font-bold text-xl text-tx-primary mb-2 text-center">Rest Complete!</h3>
        <p className="text-sm text-tx-muted mb-6 text-center">Get back to work!</p>
        <button
          onClick={() => clearRest()}
          className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors font-semibold text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>,
    document.body
  )
}
