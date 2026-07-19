import { Volume } from '../utils/muscleVolume'
import { muscleColorBordered } from '../utils/exerciseUtils'

interface Props {
  volume: Volume
  size?: 'sm' | 'md'
  label?: string
}

// MuscleVolume renders a program or day's muscle tally: primary muscles as counted
// colored chips (chest x2) and secondary muscles as a muted "also" line. Renders
// nothing when there is no primary work (empty or rest day).
export default function MuscleVolume({ volume, size = 'sm', label }: Props) {
  if (volume.primary.length === 0) return null

  const chip = size === 'md' ? 'text-xs px-2 py-1' : 'text-[11px] px-1.5 py-0.5'

  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] font-medium text-tx-muted uppercase tracking-wider">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {volume.primary.map(({ muscle, count }) => (
          <span
            key={muscle}
            className={`inline-flex items-center gap-1 rounded-md border font-medium capitalize ${chip} ${muscleColorBordered(muscle)}`}
          >
            {muscle}
            <span className="tabular-nums opacity-80">×{count}</span>
          </span>
        ))}
      </div>
      {volume.secondary.length > 0 && (
        <p className="text-[11px] text-tx-muted capitalize">
          also: {volume.secondary.join(', ')}
        </p>
      )}
    </div>
  )
}
