interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: readonly Option<T>[] | Option<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}

const ITEM: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-3 py-2.5 text-sm rounded-lg',
}

export default function SegmentedControl<T extends string>({
  options, value, onChange, size = 'md', className = '',
}: Props<T>) {
  return (
    <div className={`flex gap-1 bg-surface-overlay rounded-xl p-1 ${className}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 font-medium transition-all duration-150 ${ITEM[size]} ${
            value === opt.value
              ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
              : 'text-tx-muted hover:text-tx-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
