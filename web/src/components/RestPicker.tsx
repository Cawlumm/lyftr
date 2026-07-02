import { useState } from 'react'
import { Clock, TimerOff, Pencil, Minus, Plus } from 'lucide-react'

interface Props {
  value: number
  onChange: (secs: number) => void
}

const PRESETS = [0, 60, 90, 120, 180]
const SEGMENTS = [
  { v: 0, label: 'Off', Icon: TimerOff },
  { v: 60, label: '60s', Icon: Clock },
  { v: 90, label: '90s', Icon: Clock },
  { v: 120, label: '120s', Icon: Clock },
  { v: 180, label: '180s', Icon: Clock },
]

// Per-exercise rest control: one connected segmented bar (Off · presets · Custom),
// each segment icon-labelled. Custom reveals a seconds field when chosen.
export default function RestPicker({ value, onChange }: Props) {
  const isCustom = !PRESETS.includes(value)
  const [showCustom, setShowCustom] = useState(false)
  const customActive = isCustom || showCustom

  const seg = (active: boolean) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
      active ? 'bg-brand-500 text-white' : 'bg-surface-muted text-tx-secondary hover:text-tx-primary'
    }`

  return (
    <div>
      <div className="flex rounded-xl border border-surface-border overflow-hidden divide-x divide-surface-border">
        {SEGMENTS.map(({ v, label, Icon }) => (
          <button key={v} type="button" onClick={() => { setShowCustom(false); onChange(v) }} className={seg(!customActive && value === v)}>
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11px] font-semibold leading-none">{label}</span>
          </button>
        ))}
        <button type="button" onClick={() => setShowCustom(true)} className={seg(customActive)}>
          <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] font-semibold leading-none">{isCustom ? `${value}s` : 'Custom'}</span>
        </button>
      </div>
      {customActive && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button type="button" aria-label="−5 seconds" onClick={() => onChange(Math.max(0, value - 5))}
            className="p-2.5 rounded-xl bg-surface-muted border border-surface-border text-tx-secondary active:scale-95 hover:text-tx-primary">
            <Minus className="w-4 h-4" />
          </button>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={3600}
              value={value}
              onChange={e => onChange(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
              className="input w-28 text-center py-2.5 pr-9 text-base font-semibold tabular-nums"
              aria-label="Rest seconds"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none">sec</span>
          </div>
          <button type="button" aria-label="+5 seconds" onClick={() => onChange(Math.min(3600, value + 5))}
            className="p-2.5 rounded-xl bg-surface-muted border border-surface-border text-tx-secondary active:scale-95 hover:text-tx-primary">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
