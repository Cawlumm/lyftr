import { useState } from 'react'
import { TimerOff, Pencil } from 'lucide-react'

interface Props {
  value: number
  onChange: (secs: number) => void
}

const PRESETS = [60, 90, 120, 180]

// Per-exercise rest control. The numeric presets are solid chips; Off (disable)
// and Custom (type-a-value) get a distinct ghost + icon look so they read as a
// different kind of control. Custom reveals a seconds field only when chosen.
export default function RestPicker({ value, onChange }: Props) {
  const isCustom = value !== 0 && !PRESETS.includes(value)
  const [showCustom, setShowCustom] = useState(false)
  const customActive = isCustom || showCustom

  const base = 'px-3 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-1'
  const solid = (active: boolean) =>
    `${base} ${active ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-muted border border-surface-border text-tx-secondary hover:text-tx-primary'}`
  const ghost = (active: boolean, dashed = false) =>
    `${base} ${active
      ? 'bg-brand-500 text-white shadow-sm border border-brand-500'
      : `bg-transparent border ${dashed ? 'border-dashed' : ''} border-surface-border text-tx-muted hover:text-tx-primary`}`

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <button type="button" onClick={() => { setShowCustom(false); onChange(0) }} className={ghost(!customActive && value === 0)}>
          <TimerOff className="w-3.5 h-3.5" /> Off
        </button>
        {PRESETS.map(sec => (
          <button key={sec} type="button" onClick={() => { setShowCustom(false); onChange(sec) }} className={solid(!customActive && value === sec)}>
            {sec}s
          </button>
        ))}
        <button type="button" onClick={() => setShowCustom(true)} className={ghost(customActive, true)}>
          <Pencil className="w-3.5 h-3.5" /> {isCustom ? `${value}s` : 'Custom'}
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
