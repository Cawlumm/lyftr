interface PeriodSelectorProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}

export default function PeriodSelector<T extends string>({ options, value, onChange }: PeriodSelectorProps<T>) {
  return (
    <div className="flex gap-1 bg-surface-overlay rounded-lg p-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 ${
            value === opt
              ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
              : 'text-tx-muted hover:text-tx-primary'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
