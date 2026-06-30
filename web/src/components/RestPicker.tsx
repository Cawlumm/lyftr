import { useState } from 'react'

interface Props {
  value: number
  onChange: (secs: number) => void
}

const PRESETS = [0, 60, 90, 120, 180]

// Per-exercise rest control: Off (0) + presets + a Custom button that reveals a
// seconds field only when chosen. Even grid so nothing's cramped.
export default function RestPicker({ value, onChange }: Props) {
  const isCustom = !PRESETS.includes(value)
  const [showCustom, setShowCustom] = useState(false)
  const customActive = isCustom || showCustom

  const chip = (active: boolean) =>
    `px-3 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
      active ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-muted border border-surface-border text-tx-secondary hover:text-tx-primary'
    }`

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {PRESETS.map(sec => (
          <button
            key={sec}
            type="button"
            onClick={() => { setShowCustom(false); onChange(sec) }}
            className={chip(!customActive && value === sec)}
          >
            {sec === 0 ? 'Off' : `${sec}s`}
          </button>
        ))}
        <button type="button" onClick={() => setShowCustom(true)} className={chip(customActive)}>
          {isCustom ? `${value}s` : 'Custom'}
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
