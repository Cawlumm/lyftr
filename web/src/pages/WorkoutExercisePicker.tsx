import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Dumbbell } from 'lucide-react'
import { exerciseAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { types } from '@lyftr/shared'
import { muscleColorBordered, EQUIPMENT_LABEL } from '../utils/exerciseUtils'

// Must match the server's default page size: a short page is what signals the end.
const PAGE_SIZE = 50

export default function WorkoutExercisePicker() {
  const navigate = useNavigate()
  const { session, addExercise } = useWorkoutSession()
  const [exercises, setExercises] = useState<types.Exercise[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)
  // Identifies the newest request so a slow earlier one cannot overwrite it.
  const reqRef = useRef(0)

  const selectedIds = session?.exercises.map(e => e.exercise_id) ?? []

  // The server answers each page from open-exercise-db. Nothing pulls the catalog
  // into the browser to slice it here — this screen used to render the first 40 of
  // whatever it had downloaded and tell the user to refine their search, which was
  // a truncation dressed up as advice.
  const load = useCallback(async (q: string, nextPage: number, append = false) => {
    const id = ++reqRef.current
    setLoading(true)
    try {
      const data = await exerciseAPI.list({ ...(q ? { q } : {}), page: nextPage }) || []
      // Typing faster than the network otherwise leaves the list showing results for
      // a query the user has already moved on from.
      if (reqRef.current !== id) return
      setExercises(prev => (append ? [...prev, ...data] : data))
      setExhausted(data.length < PAGE_SIZE)
      setPage(nextPage)
    } catch { /* a failed search keeps the previous list rather than blanking it */ }
    finally { if (reqRef.current === id) setLoading(false) }
  }, [])

  // One effect, not two. An initial load plus a debounced query effect both fire
  // on mount, so opening the picker fetched page 1 twice — the debounce only
  // staggered them. Debouncing the empty query by zero gives the first page
  // immediately and still waits out typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setExhausted(false)
      load(query, 1)
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, load])

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
            {available.length} loaded{exhausted ? '' : '…'}
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
        {loading && exercises.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
            <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
            Loading…
          </div>
        ) : available.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
            No exercises found
          </div>
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
            {!exhausted && (
              <button
                type="button"
                onClick={() => load(query, page + 1, true)}
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
