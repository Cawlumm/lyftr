import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { type FilterGroup, type FilterValues, activeFilterCount, useTranslation } from '@lyftr/shared'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useSheetDrag } from '../../hooks/useSheetDrag'

interface Props {
  open: boolean
  groups: readonly FilterGroup[]
  values: FilterValues
  /** Fires with the option picked, or null when the one already on is picked again. */
  onChange: (key: string, value: string | null) => void
  onReset: () => void
  onClose: () => void
}

// The panel behind a FilterButton: one section per group, every option visible at once
// instead of scrolled past. Generic over `groups`, so a screen with other filters brings its
// own list and nothing here changes. Changes apply as they are made (the list updates behind
// the scrim); Done only closes. Mirrors mobile's FilterSheet.
export default function FilterSheet({ open, groups, values, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation()
  useBodyScrollLock(open)
  useEscapeKey(open, onClose)
  const drag = useSheetDrag(onClose)
  if (!open) return null

  const count = activeFilterCount(groups, values)

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('filters.title')}
        onClick={e => e.stopPropagation()}
        style={drag.style}
        className="animate-slide-up bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col"
      >
        <div {...drag.handlers}>
          <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mt-3 sm:hidden" />
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
            <h3 className="font-display font-bold text-lg text-tx-primary">{t('filters.title')}</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onReset}
                disabled={count === 0}
                className="px-2 py-1.5 rounded-lg text-sm font-medium text-brand-500 hover:bg-brand-500/10 transition-colors disabled:text-tx-muted disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {t('filters.reset')}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="p-2 -mr-2 rounded-lg text-tx-muted hover:text-tx-primary hover:bg-surface-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {groups.map(group => (
            <div key={group.key} role="group" aria-label={group.label}>
              <div className="flex items-baseline justify-between mb-2.5">
                <p className="text-sm font-semibold text-tx-primary">{group.label}</p>
                {values[group.key] != null && (
                  <p className="text-xs text-brand-500 capitalize">
                    {group.options.find(o => o.value === values[group.key])?.label}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map(option => {
                  const on = values[group.key] === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange(group.key, on ? null : option.value)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium border capitalize transition-colors ${
                        on
                          ? 'bg-brand-500/15 border-brand-500/40 text-brand-500'
                          : 'bg-surface-muted border-surface-border text-tx-muted hover:text-tx-primary'
                      }`}
                    >
                      {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 pt-3 border-t border-surface-border">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {t('filters.done')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
