import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Dumbbell, Search, X } from 'lucide-react'
import {
  useServerList, types, useTranslation,
  EXERCISE_PAGE_SIZE, EXERCISE_SEARCH_DEBOUNCE_MS,
  activeFilterCount, emptyFilters, exerciseBrowseFiltered, exerciseBrowseParams, exerciseFilterGroups,
  hasEquipmentToShow, parseFilters,
} from '@lyftr/shared'
import ExerciseListEmpty from '../components/ExerciseListEmpty'
import { ActiveFilters, FilterButton, FilterSheet, PageHeader } from '../components/ui'
import { exerciseAPI } from '../services/api'
import { muscleColorBordered, muscleLabel, equipmentLabel } from '../utils/exerciseUtils'

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
  const [sheetOpen, setSheetOpen] = useState(false)
  const groups = exerciseFilterGroups()
  const values = parseFilters(groups, key => params.get(key))
  const muscle = values.muscle
  const equipment = values.equipment
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  // replace, not push: every filter change in history would make Back step through filter
  // states instead of leaving the page.
  const setParam = useCallback((key: string, value: string | null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }, [setParams])

  // The box and the URL change together; only the request waits out the debounce. Otherwise
  // opening an exercise inside that window drops the search, and Back lands on the full list.
  const changeQuery = (value: string) => {
    setQuery(value)
    setParam('q', value.trim() || null)
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const filtered = exerciseBrowseFiltered({ query: debouncedQuery, muscle, equipment })
  const count = activeFilterCount(groups, values)

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      exerciseAPI
        .list({ ...exerciseBrowseParams({ query: debouncedQuery, muscle, equipment }), page: offset / limit + 1 })
        .then(data => data ?? []),
    [debouncedQuery, muscle, equipment]
  )

  const list = useServerList<types.Exercise>({
    fetcher,
    pageSize: EXERCISE_PAGE_SIZE,
    deps: [debouncedQuery, muscle, equipment],
  })
  const { items: exercises, loadMore, hasMore, loading, initialLoading, refreshing, staleResults } = list

  const resetFilters = () => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const key of Object.keys(emptyFilters(groups))) next.delete(key)
      return next
    }, { replace: true })
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
      <div className="flex-shrink-0 space-y-3 pb-3">
        <div className="flex items-center gap-3">
          <button
            aria-label={t('exercises.browse.backToWorkouts')}
            onClick={() => navigate('/workouts')}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-tx-muted" />
          </button>
          <div className="min-w-0 flex-1">
            <PageHeader title={t('exercises.browse.title')} subtitle={t('exercises.browse.subtitle')} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => changeQuery(e.target.value)}
              placeholder={t('exercises.picker.search')}
              aria-label={t('exercises.picker.search')}
              className={`input pl-10 w-full ${query ? 'pr-10' : ''}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => changeQuery('')}
                aria-label={t('common.clearSearch')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-tx-muted hover:text-tx-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <FilterButton active={count} onClick={() => setSheetOpen(true)} />
        </div>

        <ActiveFilters groups={groups} values={values} onRemove={key => setParam(key, null)} />
      </div>

      <FilterSheet
        open={sheetOpen}
        groups={groups}
        values={values}
        onChange={setParam}
        onReset={resetFilters}
        onClose={() => setSheetOpen(false)}
      />

      {/* The header above stays put and only the list scrolls, as in the picker: a hundred
          rows in, changing a filter should not mean scrolling back to the top for it. The
          rows fade while a new query or filter revalidates and swap in place when it lands. */}
      <div className={`flex-1 overflow-y-auto -mx-4 px-4 transition-opacity ${refreshing ? 'opacity-50' : ''}`}>
      {initialLoading ? (
        <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
          <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
          {t('exercises.picker.loadingShort')}
        </div>
      ) : exercises.length === 0 || staleResults ? (
        <ExerciseListEmpty
          query={debouncedQuery}
          filtered={filtered}
          emptyTitle={filtered ? t('exercises.browse.noMatchTitle') : undefined}
          emptyBody={filtered ? (count > 0 ? t('exercises.browse.noMatchBody') : t('common.tryDifferentSearch')) : undefined}
          emptyAction={count > 0 ? (
            <button type="button" onClick={resetFilters} className="btn-secondary btn-sm">
              {t('filters.reset')}
            </button>
          ) : undefined}
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
              <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
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
