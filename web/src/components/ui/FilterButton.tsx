import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from '@lyftr/shared'

interface Props {
  /** How many filters are on. Zero is the plain button; more lights it up with the count. */
  active: number
  onClick: () => void
}

// The button beside a search box that opens a FilterSheet. The count is on the button itself
// so what is narrowing the list is visible without opening anything.
export default function FilterButton({ active, onClick }: Props) {
  const { t } = useTranslation()
  const on = active > 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? t('filters.buttonActive', { active }) : t('filters.button')}
      title={t('filters.button')}
      className={`relative flex-shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${
        on
          ? 'bg-brand-500/15 border-brand-500/40 text-brand-500'
          : 'bg-surface-muted border-surface-border text-tx-muted hover:text-tx-primary'
      }`}
    >
      <SlidersHorizontal className="w-4 h-4" />
      {on && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[11px] font-semibold flex items-center justify-center">
          {active}
        </span>
      )}
    </button>
  )
}
