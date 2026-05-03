interface Props {
  label?: string
  value: string
  onChange: (value: string) => void
  max?: string
  min?: string
}

export default function DateInput({ label, value, onChange, max, min }: Props) {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <input
        type="date"
        value={value}
        onChange={e => { if (e.target.value) onChange(e.target.value) }}
        max={max}
        min={min}
        className="input w-full"
      />
    </div>
  )
}
