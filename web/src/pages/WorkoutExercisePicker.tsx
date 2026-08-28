import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Dumbbell } from 'lucide-react'
import { useServerList, types } from '@lyftr/shared'
import { ListError } from '../components/ui'
import { exerciseAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { muscleColorBordered, EQUIPMENT_LABEL } from '../utils/exerciseUtils'

// Must match the server's default page size: a short page is what signals the end.
const PAGE_SIZE = 50
const DEBOUNCE_MS = 250

export default function WorkoutExercisePicker() {
  const navigate = useNavigate()
  const { session, addExercise } = useWorkoutSession()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const selectedIds = session?.exercises.map(e => e.exercise_id) ?? []

  // The server answers each page from open-exercise-db. Nothing pulls the catalog
  // into the browser to slice it here — this screen used to render the first 40 of
  // whatever it had downloaded and tell the user to refine their search, which was
  // a truncation dressed up as advice.
  const fetcher = useCallback(
    (offset: number, limit: number) =>
      exerciseAPI
        .list({ ...(debouncedQuery ? { q: debouncedQuery } : {}), page: offset / limit + 1 })
        .then(data => data ?? []),
    [debouncedQuery]
  )

  const {
    items: exercises, loadMore, hasMore, loading, initialLoading, error, retry,
  } = useServerList<types.Exercise>({
    fetcher,
    pageSize: PAGE_SIZE,
    deps: [debouncedQuery],
  })

  const handleSelect = (exercise: types.Exercise) => {
    const newEx: types.ActiveSessionExercise = {
      exercise_id: exercise.id,
      exercise,
      notes: '',
      sets: [{
        set_number: 1,
        target_reps: 0,
        target_weight: 0,
        actual_reps: 0,
        actual_weight: 0,
        completed: false,
      }],
    }
    addExercise(newEx)
    navigate('/workout/active')
  }

  const available = exercises.filter(e => !selectedIds.includes(e.id))

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          onClick={() => navigate('/workout/active')}
          className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div>
          <h1 className="font-display font-bold text-xl text-tx-primary">Add Exercise</h1>
          <p className="text-xs text-tx-muted">
            {available.length} loaded{hasMore ? '…' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="input pl-10 w-full"
          autoFocus
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto -mx-4 px-4">
        {initialLoading ? (
          <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
            <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
            Loading…
          </div>
        ) : available.length === 0 ? (
          // "No exercises found" is only true if we heard back. On a failed fetch it
          // reads as an empty catalogue rather than a connection that dropped.
          error ? (
            <div className="py-4">
              <ListError message={error} onRetry={retry} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
              No exercises found
            </div>
          )
        ) : (
          <div className="space-y-1">
            {available.map(ex => (
              <button
                key={ex.id}
                onClick={() => handleSelect(ex)}
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
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${muscleColorBordered(ex.muscle_group)}`}>
                      {ex.muscle_group}
                    </span>
                    {ex.equipment && ex.equipment !== 'other' && (
                      <span className="text-xs text-tx-muted">
                        {EQUIPMENT_LABEL[ex.equipment] || ex.equipment}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="btn-secondary btn-sm w-full my-3"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
