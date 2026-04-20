import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Dumbbell, Plus, Clock, Search, AlertCircle, Edit2, Trash2, TrendingUp, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import { workoutAPI } from '../services/api'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

function WorkoutCard({ workout, onEdit, onDelete }: { workout: types.Workout; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const navigate = useNavigate()
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
            <button onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="px-3 py-1.5 text-xs bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium flex items-center gap-1">
              <Trash2 className="w-3 h-3" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden group active:scale-[0.99] transition-transform">
      <div className="flex items-center p-4 gap-3">
        {/* Thumbnail — tappable, navigates to detail */}
        <button
          onClick={() => navigate(`/workouts/${workout.id}`)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
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
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tx-primary truncate">{workout.name}</p>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-xs text-tx-muted">{format(new Date(workout.started_at), 'MMM d, yyyy')}</span>
              {durationMin > 0 && (
                <>
                  <span className="text-tx-muted/40 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-tx-muted">
                    <Clock className="w-3 h-3" />{durationMin} min
                  </span>
                </>
              )}
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
          <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
        </button>

        {/* Action buttons — always visible on mobile, hover on desktop */}
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit(workout.id) }}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-brand-500" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true) }}
            className="p-2 hover:bg-error-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-error-400" />
          </button>
        </div>
      </div>
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
