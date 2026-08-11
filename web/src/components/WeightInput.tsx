import { useNumericText } from '@lyftr/shared'

interface Props {
  value: string
  onChange: (next: string) => void
  unit: string
  autoFocus?: boolean
  size?: 'sm' | 'md' | 'lg'
  placeholder?: string
  disabled?: boolean
}

// Typing is always 0.1-precision (the #39 feature), whatever the caller does with
// the value afterwards.
const INPUT_STEP = 0.1

// A bordered number field with the unit rendered inside it, for the compact rows of
// the sets tables (add/edit workout, program day editor, active workout).
//
// It used to carry an optional +/- stepper too, but every prominent input that
// wanted buttons has moved to StepperTile — bodyweight in #91, gym mode long before
// that — and the callers left here all opted out of it. Reach for StepperTile if you
// need buttons; this component is the bare field on purpose.
export default function WeightInput({
  value,
  onChange,
  unit,
  autoFocus = false,
  size = 'md',
  placeholder = '0.0',
  disabled = false,
}: Props) {
  // Raw typed text (see useNumericText) so in-progress entry isn't clobbered by the
  // parent re-deriving `value` from a rounded/0→'' number on every keystroke.
  const [text, setText] = useNumericText(value)

  const inputSize = size === 'lg'
    ? 'text-3xl py-4 font-display font-bold'
    : size === 'sm'
      ? 'text-sm py-2.5'
      : 'text-base py-2.5'

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="number"
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        onChange={e => { const v = e.target.value.replace(/-/g, ''); setText(v); onChange(v) }}
        onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
        step={INPUT_STEP}
        min="0"
        autoFocus={autoFocus}
        disabled={disabled}
        className={`input ${inputSize} pr-7 text-center w-full tabular-nums ${disabled ? 'opacity-40' : ''}`}
        placeholder={placeholder}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none">{unit}</span>
    </div>
  )
}
