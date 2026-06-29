import { Minus, Plus } from 'lucide-react'

interface Props {
  value: string
  onChange: (next: string) => void
  unit: string
  /** Increment for the +/- stepper buttons. Typing is always 0.1-precision regardless. */
  step?: number
  autoFocus?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Show the +/- stepper buttons (prominent inputs). Off = bare field for compact rows. */
  stepper?: boolean
  placeholder?: string
  disabled?: boolean
  /** Optional upper bound (display units) — clamps the +/- stepper. Submit-time
   *  validation/messaging is the caller's job (an html max would preempt it with
   *  a native browser tooltip). */
  max?: number
}

// The field always accepts 0.1 precision (the #39 feature); the +/- buttons step
// by `step` — a larger, ergonomic increment — so gym mode can jump by 2.5 while you
// can still type an exact 0.1 value. Bodyweight keeps the original 0.5 button feel.
const INPUT_STEP = 0.1
const STEP_DEFAULT = 0.5

// Single component for every weight input in the app. Conversion-agnostic: the
// caller owns lbs↔display unit (pass display-unit strings in/out). `stepper`
// toggles the prominent +/- layout (bodyweight, gym mode) vs a bare field for
// compact sets-table rows. All weight inputs share step=0.1 + the unit suffix.
export default function WeightInput({
  value,
  onChange,
  unit,
  step = STEP_DEFAULT,
  autoFocus = false,
  size = 'md',
  stepper = true,
  placeholder = '0.0',
  disabled = false,
  max,
}: Props) {
  const adjust = (delta: number) => {
    const current = parseFloat(value)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.min(max ?? Infinity, Math.max(0, +(base + delta).toFixed(1)))
    onChange(String(next))
  }

  const inputSize = size === 'lg'
    ? 'text-3xl py-4 font-display font-bold'
    : size === 'sm'
      ? 'text-sm py-2.5'
      : 'text-base py-2.5'
  // Compact contexts (bare field or sm) use tighter unit padding.
  const compact = !stepper || size === 'sm'
  const pad = compact ? 'pr-7' : 'pr-12'
  const unitPos = compact ? 'right-2' : 'right-3.5'

  const field = (
    <div className="relative flex-1 min-w-0">
      <input
        type="number"
        inputMode="decimal"
        enterKeyHint="done"
        value={value}
        onChange={e => onChange(e.target.value)}
        step={INPUT_STEP}
        min="0"
        autoFocus={autoFocus}
        disabled={disabled}
        className={`input ${inputSize} ${pad} text-center w-full tabular-nums ${disabled ? 'opacity-40' : ''}`}
        placeholder={placeholder}
      />
      <span className={`absolute ${unitPos} top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none`}>{unit}</span>
    </div>
  )

  if (!stepper) return field

  const buttonSize = size === 'lg' ? 'p-4' : 'p-2.5'
  const iconSize = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'
  const btn = `${buttonSize} bg-surface-overlay border border-surface-border rounded-lg text-tx-secondary hover:bg-surface-muted active:scale-95 transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-30`

  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={() => adjust(-step)} disabled={disabled} className={btn} aria-label={`Decrease by ${step}`}>
        <Minus className={iconSize} />
      </button>
      {field}
      <button type="button" onClick={() => adjust(step)} disabled={disabled} className={btn} aria-label={`Increase by ${step}`}>
        <Plus className={iconSize} />
      </button>
    </div>
  )
}
