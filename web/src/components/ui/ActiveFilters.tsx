import { X } from 'lucide-react'
import { type FilterGroup, type FilterValues, activeFilters, useTranslation } from '@lyftr/shared'

interface Props {
  groups: readonly FilterGroup[]
  values: FilterValues
  onRemove: (key: string) => void
}

// What is on, as removable chips under the search box, so a filter can be dropped in one tap
// without reopening the sheet. Renders nothing when nothing is on.
export default function ActiveFilters({ groups, values, onRemove }: Props) {
  const { t } = useTranslation()
  const active = activeFilters(groups, values)
  if (active.length === 0) return null
  return (
    <div role="group" aria-label={t('filters.active')} className="flex gap-1.5 overflow-x-auto -mx-4 px-4">
      {active.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => onRemove(f.key)}
          aria-label={t('filters.remove', { label: f.label })}
          className="animate-slide-up flex-shrink-0 inline-flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium border capitalize bg-brand-500/15 border-brand-500/40 text-brand-500 hover:bg-brand-500/25 transition-colors"
        >
          {f.label}
          <X className="w-3 h-3" />
        </button>
      ))}
    </div>
  )
}
