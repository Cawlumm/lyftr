import { Minus, Plus } from 'lucide-react'
import { useNumericText } from '../hooks/useNumericText'
import { BODYWEIGHT_STEP, clampStep } from '../utils/number'

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

// Two different granularities that happen to be the same number right now, and must
// not be collapsed into one: INPUT_STEP is what the field accepts typed (the #39
// feature — always tenths, whatever the buttons do), STEP_DEFAULT is how far one
// +/- tap moves. They coincide because bodyweight, the only caller that shows the
// buttons, wants the finest step the field can hold (#80).
//
// Nothing overrides `step` today: the sets tables pass stepper={false}, and gym mode
// builds its own tiles from StepperTile + NumberField (see PLATE_STEP). The prop
// stays for a caller that wants a coarser jump.
const INPUT_STEP = 0.1
const STEP_DEFAULT = BODYWEIGHT_STEP

// Single component for every weight input in the app. Conversion-agnostic: the
// caller owns lbs↔display unit (pass display-unit strings in/out). `stepper`
// toggles the prominent +/- layout (bodyweight, gym mode) vs a bare field for
// compact sets-table rows. (Gym set tiles use the borderless NumberField instead.)
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
  // Raw typed text (see useNumericText) so in-progress entry isn't clobbered by the
  // parent re-deriving `value` from a rounded/0→'' number on every keystroke.
  const [text, setText] = useNumericText(value)

  const emit = (next: string) => {
    setText(next)
    onChange(next)
  }

  const adjust = (delta: number) => emit(String(clampStep(parseFloat(text), delta, { max })))

  const inputSize = size === 'lg'
    ? 'text-3xl py-4 font-display font-bold'
    : size === 'sm'
      ? 'text-sm py-2.5'
      : 'text-base py-2.5'
  const compact = !stepper || size === 'sm'
  const pad = compact ? 'pr-7' : 'pr-12'
  const unitPos = compact ? 'right-2' : 'right-3.5'

  const field = (
    <div className="relative flex-1 min-w-0">
      <input
        type="number"
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        onChange={e => emit(e.target.value.replace(/-/g, ''))}
        onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
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
