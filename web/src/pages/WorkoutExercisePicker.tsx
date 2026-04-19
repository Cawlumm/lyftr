import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Dumbbell } from 'lucide-react'
import { exerciseAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import * as types from '../types'
import { muscleColorBordered, EQUIPMENT_LABEL } from '../utils/exerciseUtils'

export default function WorkoutExercisePicker() {
  const navigate = useNavigate()
  const { session, addExercise } = useWorkoutSession()
  const [exercises, setExercises] = useState<types.Exercise[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedIds = session?.exercises.map(e => e.exercise_id) ?? []

  useEffect(() => {
    load('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const load = async (q: string) => {
    setLoading(true)
    try {
      const data = await exerciseAPI.list(q ? { q } : undefined)
      setExercises(data || [])
    } catch {}
    finally { setLoading(false) }
  }

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
          <p className="text-xs text-tx-muted">{available.length} available</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, muscle, equipment…"
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
            {available.slice(0, 40).map(ex => (
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
            {available.length > 40 && (
              <p className="text-xs text-tx-muted text-center py-3">
                Showing 40 of {available.length} — refine search
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
