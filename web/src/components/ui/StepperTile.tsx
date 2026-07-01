import { Minus, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  label: string
  /** Concise metric name for the step buttons' aria-labels (e.g. "reps", "weight"). */
  name: string
  step: number
  onStep: (delta: number) => void
  disabled?: boolean
  /** The value field (a NumberField / WeightInput) shown between header and footer. */
  children: React.ReactNode
}

// A metric tile: icon header, a full-width value field, and a split decrement /
// increment footer. Shared by the gym reps + weight inputs so the layout and the
// stepper buttons live in one place.
export default function StepperTile({ icon: Icon, label, name, step, onStep, disabled = false, children }: Props) {
  const btn = 'flex-1 py-2.5 flex items-center justify-center text-tx-secondary hover:bg-surface-muted active:scale-95 transition-all disabled:opacity-30'
  return (
    <div className="card overflow-hidden">
      <div className="px-3 pt-3 pb-1.5 flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-tx-muted uppercase tracking-wider">
          <Icon className="w-3.5 h-3.5 text-brand-400" />{label}
        </div>
        {children}
      </div>
      <div className="flex border-t border-surface-border divide-x divide-surface-border">
        <button type="button" aria-label={`Decrease ${name}`} disabled={disabled} onClick={() => onStep(-step)} className={btn}>
          <Minus className="w-5 h-5" />
        </button>
        <button type="button" aria-label={`Increase ${name}`} disabled={disabled} onClick={() => onStep(step)} className={btn}>
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
