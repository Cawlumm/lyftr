import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Dumbbell, Plus, ChevronRight, BarChart2, Clock, Weight, Search, AlertCircle } from 'lucide-react'
import { HelpTip } from '../components/Tooltip'
import Loading from '../components/Loading'
import { workoutAPI } from '../services/api'
import * as types from '../types'

function WorkoutCard({ workout }: { workout: types.Workout }) {
  const [open, setOpen] = useState(false)
  const durationMin = Math.round(workout.duration / 60)

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-surface-muted transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-4 h-4 text-brand-500" strokeWidth={2} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-tx-primary">{workout.name}</p>
            <p className="text-xs text-tx-muted">{format(new Date(workout.started_at), 'MMM d, yyyy')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-tx-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {durationMin} min
            </span>
            <span className="flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" /> {workout.exercises?.length || 0} exercises
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-tx-muted transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-surface-border animate-slide-up">
          <div className="px-4 py-2">
            <div className="grid grid-cols-4 text-xs text-tx-muted uppercase tracking-wider py-2 border-b border-surface-border">
              <span className="col-span-2">Exercise</span>
              <span className="text-right">Sets</span>
              <span className="text-right">Avg Weight</span>
            </div>
            {workout.exercises?.map((ex) => {
              const avgWeight = ex.sets?.length > 0
                ? (ex.sets.reduce((sum, s) => sum + (s.weight || 0), 0) / ex.sets.length).toFixed(0)
                : '—'
              return (
                <div key={ex.id} className="grid grid-cols-4 text-sm py-2.5 border-b border-surface-border last:border-0">
                  <span className="col-span-2 text-tx-primary font-medium">{ex.exercise.name}</span>
                  <span className="text-right text-tx-secondary tabular-nums">{ex.sets?.length || 0}</span>
                  <span className="text-right text-tx-muted tabular-nums">{avgWeight} lbs</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 bg-surface-muted">
            <button className="btn-ghost btn-sm">Details</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Workouts() {
  const [workouts, setWorkouts] = useState<types.Workout[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await workoutAPI.list({ limit: 50 })
        setWorkouts(data || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load workouts')
      } finally {
        setLoading(false)
      }
    }
    load()
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
        <button className="btn-primary btn-md">
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
          filtered.map(w => <WorkoutCard key={w.id} workout={w} />)
        )}
      </div>
    </div>
  )
}
