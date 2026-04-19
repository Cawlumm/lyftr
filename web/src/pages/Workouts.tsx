import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Dumbbell, Plus, ChevronDown, Clock, Search, AlertCircle, Edit2, Trash2, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import { workoutAPI } from '../services/api'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

function WorkoutCard({ workout, onEdit, onDelete }: { workout: types.Workout; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const durationMin = Math.round(workout.duration / 60)
  const totalVolume = Math.round(
    workout.exercises?.reduce((total, e) =>
      total + (e.sets?.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0) || 0), 0) || 0
  )

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await workoutAPI.delete(workout.id)
      onDelete(workout.id)
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="card overflow-hidden border-error-500/30">
        <div className="flex items-center justify-between p-4 bg-error-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-error-500/10 border border-error-500/20 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-error-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-tx-primary">Delete "{workout.name}"?</p>
              <p className="text-xs text-tx-muted">This cannot be undone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between p-4 hover:bg-surface-muted transition-colors group">
        <button
          className="flex-1 flex items-center gap-3 min-w-0"
          onClick={() => setOpen(o => !o)}
        >
          {workout.exercises?.[0]?.exercise?.image_url ? (
            <img
              src={workout.exercises[0].exercise.image_url}
              alt=""
              className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-5 h-5 text-brand-500" strokeWidth={2} />
            </div>
          )}
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-tx-primary truncate">{workout.name}</p>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-xs text-tx-muted">{format(new Date(workout.started_at), 'MMM d, yyyy')}</span>
              <span className="text-tx-muted/40 text-xs">·</span>
              <span className="flex items-center gap-1 text-xs text-tx-muted">
                <Clock className="w-3 h-3" />{durationMin} min
              </span>
              <span className="text-tx-muted/40 text-xs">·</span>
              <span className="text-xs text-tx-muted">{workout.exercises?.length || 0} exercises</span>
              {totalVolume > 0 && (
                <>
                  <span className="text-tx-muted/40 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-tx-muted">
                    <TrendingUp className="w-3 h-3" />{totalVolume.toLocaleString()} lbs
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onEdit(workout.id) }}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            title="Edit workout"
          >
            <Edit2 className="w-4 h-4 text-brand-500" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true) }}
            className="p-2 hover:bg-error-500/10 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            title="Delete workout"
          >
            <Trash2 className="w-4 h-4 text-error-400" />
          </button>
          <ChevronDown className={`w-4 h-4 text-tx-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="border-t border-surface-border animate-slide-up">
          <div className="p-3 space-y-2">
            {workout.exercises?.map((ex) => {
              const maxWeight = ex.sets?.length > 0
                ? Math.max(...ex.sets.map(s => s.weight || 0))
                : 0
              const exVol = ex.sets?.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0) || 0

              return (
                <div key={ex.id} className="bg-surface-muted/30 border border-surface-border rounded-xl overflow-hidden">
                  {/* Exercise header */}
                  <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                    {ex.exercise.image_url ? (
                      <img
                        src={ex.exercise.image_url}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-surface-muted"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Dumbbell className="w-4 h-4 text-brand-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-tx-primary leading-tight truncate">{ex.exercise.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${muscleColor(ex.exercise.muscle_group)}`}>
                          {ex.exercise.muscle_group}
                        </span>
                        <span className="text-xs text-tx-muted">{ex.sets?.length || 0} sets</span>
                        {exVol > 0 && <span className="text-xs text-tx-muted">{exVol.toLocaleString()} lbs</span>}
                      </div>
                    </div>
                    {maxWeight > 0 && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-tx-muted leading-tight">best</p>
                        <p className="text-sm font-bold text-brand-400 tabular-nums">{maxWeight} lb</p>
                      </div>
                    )}
                  </div>

                  {/* Sets — inline chips, best highlighted */}
                  {ex.sets?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-2 border-t border-surface-border/50 mt-2">
                      {ex.sets.map((set, i) => {
                        const isBest = set.weight === maxWeight && maxWeight > 0
                        return (
                          <div
                            key={i}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums leading-none ${
                              isBest
                                ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25'
                                : 'bg-surface-raised text-tx-secondary'
                            }`}
                          >
                            {set.reps > 0 ? set.reps : '—'} × {set.weight > 0 ? `${set.weight} lb` : 'BW'}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Workouts() {
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState<types.Workout[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWorkouts = async () => {
    try {
      const data = await workoutAPI.list({ limit: 50 })
      setWorkouts(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load workouts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkouts()
  }, [])

  const filtered = workouts.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <Loading />
  }

  if (error) {
    return (
      <div className="alert-error">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Workouts</h1>
          <p className="text-tx-muted text-sm mt-0.5">Track and review your training sessions</p>
        </div>
        <button onClick={() => navigate('/workouts/new')} className="btn-primary btn-md">
          <Plus className="w-4 h-4" /> Log Workout
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: workouts.length.toString(), unit: 'workouts', icon: Dumbbell },
          { label: 'This Month', value: workouts.filter(w => new Date(w.started_at).getMonth() === new Date().getMonth()).length.toString(), unit: 'sessions', icon: Clock },
          { label: 'Avg Duration', value: workouts.length > 0 ? Math.round(workouts.reduce((sum, w) => sum + w.duration, 0) / workouts.length / 60).toString() : '0', unit: 'min', icon: Clock },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="stat-value text-xl">{s.value}</span>
              <span className="text-xs text-tx-muted mb-0.5">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-10"
          placeholder="Search workouts…"
        />
      </div>

      {/* Workout list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
              <Dumbbell className="w-6 h-6 text-tx-muted" />
            </div>
            <p className="text-sm font-medium text-tx-primary mb-1">No workouts found</p>
            <p className="text-xs text-tx-muted">{search ? 'Try a different search' : 'Log a workout to get started'}</p>
          </div>
        ) : (
          filtered.map(w => <WorkoutCard key={w.id} workout={w}
            onEdit={(id) => navigate(`/workouts/${id}/edit`)}
            onDelete={(id) => setWorkouts(prev => prev.filter(x => x.id !== id))}
          />)
        )}
      </div>

    </div>
  )
}
