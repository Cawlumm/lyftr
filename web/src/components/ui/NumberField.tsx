import { useNumericText } from '@lyftr/shared'

// Borderless big-number field style for the inside of a metric tile (the card is
// the visual container).
const PLAIN_FIELD_CLASS =
  'w-full bg-transparent border-0 outline-none focus:ring-0 px-0 py-1 text-3xl font-black text-center tabular-nums text-tx-primary placeholder-tx-muted/50'

interface Props {
  value: string
  onChange: (next: string) => void
  inputMode?: 'numeric' | 'decimal'
  placeholder?: string
  disabled?: boolean
  min?: number
  /** Focus on mount — for tiles that open in a modal or sheet the user came here to fill in. */
  autoFocus?: boolean
  'aria-label'?: string
}

// An <input type="number"> has step=1 unless told otherwise, and the browser treats
// any value off that grid as invalid — which silently blocks form submission with
// "the two nearest valid values are 183 and 184". Decimal fields must therefore
// spell out the app's 0.1 typing precision (#39); integer fields keep the default.
const inputStepFor = (inputMode: 'numeric' | 'decimal') => (inputMode === 'numeric' ? 1 : 0.1)

// Borderless numeric field for use inside a StepperTile. Robust typing via
// useNumericText; the parent owns conversion/validation in onChange.
export default function NumberField({ value, onChange, inputMode = 'decimal', placeholder = '0', disabled = false, min = 0, autoFocus = false, ...aria }: Props) {
  const [text, setText] = useNumericText(value)
  // Non-negative always; integer fields (inputMode "numeric") also reject a decimal
  // point so reps can't be typed fractional.
  const blocked = inputMode === 'numeric' ? ['e', 'E', '+', '-', '.'] : ['e', 'E', '+', '-']
  return (
    <input
      type="number"
      inputMode={inputMode}
      enterKeyHint="done"
      step={inputStepFor(inputMode)}
      min={min}
      value={text}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onKeyDown={e => { if (blocked.includes(e.key)) e.preventDefault() }}
      onChange={e => { const v = e.target.value.replace(/-/g, ''); setText(v); onChange(v) }}
      className={`${PLAIN_FIELD_CLASS} ${disabled ? 'opacity-40' : ''}`}
      aria-label={aria['aria-label']}
    />
  )
}
