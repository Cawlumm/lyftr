import { useState } from 'react'
import { Clock, TimerOff, Pencil } from 'lucide-react'

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
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            min={0}
            max={3600}
            value={value}
            onChange={e => onChange(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
            className="input w-24 text-center py-2.5"
            aria-label="Rest seconds"
          />
          <span className="text-sm text-tx-muted">seconds</span>
        </div>
      )}
    </div>
  )
}
