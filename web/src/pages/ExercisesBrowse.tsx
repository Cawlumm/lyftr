import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, Dumbbell } from 'lucide-react'
import {
  useServerList, types, useTranslation,
  EXERCISE_FILTER_EQUIPMENT, EXERCISE_FILTER_MUSCLES,
  exerciseBrowseFiltered, exerciseBrowseParams, hasEquipmentToShow,
} from '@lyftr/shared'
import ExerciseListEmpty from '../components/ExerciseListEmpty'
import { exerciseAPI } from '../services/api'
import { muscleColorBordered, muscleLabel, equipmentLabel } from '../utils/exerciseUtils'

// Must match the server's default page size: a short page is what signals the end.
const PAGE_SIZE = 50
const DEBOUNCE_MS = 250

// A filter read off the URL is only trusted if it is one we offer: a hand-edited
// ?muscle=bogus would otherwise filter to nothing with no chip lit to explain why.
const chipValue = (raw: string | null, options: readonly string[]) =>
  raw !== null && options.includes(raw) ? raw : null

function ChipRow({ label, options, value, onChange, labelOf }: {
  label: string
  options: readonly string[]
  value: string | null
  onChange: (next: string | null) => void
  labelOf: (slug: string) => string
}) {
  // A chip restored from the URL can sit past the right edge of the row; bring it into view
  // so the filter that is shaping the list is not the one you cannot see.
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const reveal = () => activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    reveal()
    // The webfont swaps in after first paint and widens every chip, so the position measured
    // above is stale by then and the last chips end up off the edge.
    void document.fonts?.ready.then(reveal)
  }, [])
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
      {options.map(slug => {
        const on = value === slug
        return (
          <button
            key={slug}
            ref={on ? activeRef : undefined}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : slug)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-colors ${
              on
                ? 'bg-brand-500/15 border-brand-500/40 text-brand-500'
                : 'bg-surface-muted border-surface-border text-tx-muted hover:text-tx-primary'
            }`}
          >
            {labelOf(slug)}
          </button>
        )
      })}
    </div>
  )
}

// Read-only catalogue: look an exercise up and open its page without starting a workout.
// The list is the picker's (server-paged, nothing downloaded to slice here) minus the
// add-to-workout step, plus the muscle and equipment filters the API already takes.
//
// The filters live in the URL (?q=&muscle=&equipment=), not in component state: opening an
// exercise unmounts this page, and coming back used to land on the unfiltered alphabet,
// so looking at three chest exercises meant re-picking Chest three times.
export default function ExercisesBrowse() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const muscle = chipValue(params.get('muscle'), EXERCISE_FILTER_MUSCLES)
  const equipment = chipValue(params.get('equipment'), EXERCISE_FILTER_EQUIPMENT)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  // replace, not push: every chip tap in history would make Back step through filter states
  // instead of leaving the page.
  const setParam = useCallback((key: string, value: string | null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }, [setParams])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setParam('q', query.trim() || null)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, setParam])

  const setMuscle = (next: string | null) => setParam('muscle', next)
  const setEquipment = (next: string | null) => setParam('equipment', next)

  const filters = { query: debouncedQuery, muscle, equipment }
  const filtered = exerciseBrowseFiltered(filters)

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      exerciseAPI
        .list({ ...exerciseBrowseParams({ query: debouncedQuery, muscle, equipment }), page: offset / limit + 1 })
        .then(data => data ?? []),
    [debouncedQuery, muscle, equipment]
  )

  const list = useServerList<types.Exercise>({
    fetcher,
    pageSize: PAGE_SIZE,
    deps: [debouncedQuery, muscle, equipment],
  })
  const { items: exercises, loadMore, hasMore, loading, initialLoading } = list

  const clearFilters = () => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('muscle')
      next.delete('equipment')
      return next
    }, { replace: true })
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
      <div className="flex-shrink-0 space-y-4 pb-3">
      <div className="flex items-center gap-3">
        <button
          aria-label={t('exercises.browse.backToWorkouts')}
          onClick={() => navigate('/workouts')}
          className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl text-tx-primary">{t('exercises.browse.title')}</h1>
          <p className="text-xs text-tx-muted">{t('exercises.browse.subtitle')}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('exercises.picker.search')}
          aria-label={t('exercises.picker.search')}
          className="input pl-10 w-full"
        />
      </div>

      <div className="space-y-2">
        <ChipRow
          label={t('exercises.browse.muscle')}
          options={EXERCISE_FILTER_MUSCLES}
          value={muscle}
          onChange={setMuscle}
          labelOf={muscleLabel}
        />
        <ChipRow
          label={t('exercises.browse.equipment')}
          options={EXERCISE_FILTER_EQUIPMENT}
          value={equipment}
          onChange={setEquipment}
          labelOf={equipmentLabel}
        />
        {(muscle || equipment) && (
          <button type="button" onClick={clearFilters} className="text-xs text-brand-500 hover:underline">
            {t('exercises.browse.clearFilters')}
          </button>
        )}
      </div>
      </div>

      {/* The header above stays put and only the list scrolls, as in the picker: a hundred
          rows in, changing a filter should not mean scrolling back to the top for it. */}
      <div className="flex-1 overflow-y-auto -mx-4 px-4">
      {initialLoading ? (
        <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
          <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
          {t('exercises.picker.loadingShort')}
        </div>
      ) : exercises.length === 0 ? (
        <ExerciseListEmpty
          query={debouncedQuery}
          filtered={filtered}
          emptyText={filtered ? t('exercises.browse.noMatch') : undefined}
          {...list}
        />
      ) : (
        <div className="space-y-1">
          {exercises.map(ex => (
            <Link
              key={ex.id}
              to={`/exercises/${ex.id}`}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-muted transition-colors text-left"
            >
              {ex.image_url ? (
                <img
                  src={ex.image_url}
                  alt=""
                  loading="lazy"
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-surface-muted"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Dumbbell className="w-4 h-4 text-brand-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-tx-primary truncate">{ex.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border capitalize ${muscleColorBordered(ex.muscle_group)}`}>
                    {muscleLabel(ex.muscle_group)}
                  </span>
                  {hasEquipmentToShow(ex.equipment) && (
                    <span className="text-xs text-tx-muted">{equipmentLabel(ex.equipment)}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="btn-secondary btn-sm w-full my-3"
            >
              {loading ? t('exercises.picker.loadingShort') : t('exercises.picker.loadMore')}
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
