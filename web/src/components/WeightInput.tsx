import { Minus, Plus } from 'lucide-react'

interface Props {
  value: string
  onChange: (next: string) => void
  unit: string
  step?: number
  autoFocus?: boolean
  size?: 'md' | 'lg'
}

const STEP_DEFAULT = 0.5

export default function WeightInput({
  value,
  onChange,
  unit,
  step = STEP_DEFAULT,
  autoFocus = false,
  size = 'md',
}: Props) {
  const adjust = (delta: number) => {
    const current = parseFloat(value)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(0, +(base + delta).toFixed(1))
    onChange(String(next))
  }

  const inputSize = size === 'lg'
    ? 'text-3xl py-4 font-display font-bold'
    : 'text-base py-2.5'
  const buttonSize = size === 'lg' ? 'p-4' : 'p-2.5'
  const iconSize = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => adjust(-step)}
        className={`${buttonSize} bg-surface-overlay border border-surface-border rounded-lg text-tx-secondary hover:bg-surface-muted active:scale-95 transition-all flex items-center justify-center flex-shrink-0`}
        aria-label={`Decrease by ${step}`}
      >
        <Minus className={iconSize} />
      </button>
      <div className="relative flex-1 min-w-0">
        <input
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          value={value}
          onChange={e => onChange(e.target.value)}
          step={step}
          min="0"
          autoFocus={autoFocus}
          className={`input ${inputSize} pr-12 text-center w-full tabular-nums`}
          placeholder="0.0"
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-tx-muted">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => adjust(step)}
        className={`${buttonSize} bg-surface-overlay border border-surface-border rounded-lg text-tx-secondary hover:bg-surface-muted active:scale-95 transition-all flex items-center justify-center flex-shrink-0`}
        aria-label={`Increase by ${step}`}
      >
        <Plus className={iconSize} />
      </button>
    </div>
  )
}
