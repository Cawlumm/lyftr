interface Props {
  value: number
  onChange: (secs: number) => void
}

const PRESETS = [0, 60, 90, 120, 180]

// Per-exercise rest control: Off (0) + presets + a custom seconds input.
export default function RestPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 border border-surface-border">
        {PRESETS.map(sec => (
          <button
            key={sec}
            type="button"
            onClick={() => onChange(sec)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              value === sec
                ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-sm'
                : 'text-tx-muted hover:text-tx-primary'
            }`}
          >
            {sec === 0 ? 'Off' : `${sec}s`}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        max={3600}
        value={value}
        onChange={e => onChange(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
        className="input w-16 text-center text-sm py-1"
        aria-label="Rest seconds"
      />
    </div>
  )
}
