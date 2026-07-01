import { useNumericText } from '../../hooks/useNumericText'

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
  'aria-label'?: string
}

// Borderless numeric field for use inside a StepperTile. Robust typing via
// useNumericText; the parent owns conversion/validation in onChange.
export default function NumberField({ value, onChange, inputMode = 'decimal', placeholder = '0', disabled = false, min = 0, ...aria }: Props) {
  const [text, setText] = useNumericText(value)
  // Non-negative always; integer fields (inputMode "numeric") also reject a decimal
  // point so reps can't be typed fractional.
  const blocked = inputMode === 'numeric' ? ['e', 'E', '+', '-', '.'] : ['e', 'E', '+', '-']
  return (
    <input
      type="number"
      inputMode={inputMode}
      enterKeyHint="done"
      min={min}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={e => { if (blocked.includes(e.key)) e.preventDefault() }}
      onChange={e => { const v = e.target.value.replace(/-/g, ''); setText(v); onChange(v) }}
      className={`${PLAIN_FIELD_CLASS} ${disabled ? 'opacity-40' : ''}`}
      aria-label={aria['aria-label']}
    />
  )
}
