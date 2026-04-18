import { useState } from 'react'
import { Dumbbell, Plus, ChevronRight, BarChart2, Clock, Weight, Search, Filter, Info } from 'lucide-react'
import { HelpTip, Tooltip } from '../components/Tooltip'

const MOCK_WORKOUTS = [
  {
    id: 1, date: 'Today', name: 'Push Day',
    exercises: [
      { name: 'Bench Press',          sets: 4, reps: 8,  weight: 275 },
      { name: 'Incline Dumbbell',     sets: 3, reps: 10, weight: 85  },
      { name: 'Cable Fly',            sets: 3, reps: 12, weight: 40  },
      { name: 'Overhead Press',       sets: 4, reps: 8,  weight: 155 },
      { name: 'Tricep Pushdown',      sets: 3, reps: 12, weight: 60  },
    ],
    duration: '58 min', volume: 32450,
  },
  {
    id: 2, date: 'Yesterday', name: 'Cardio',
    exercises: [
      { name: 'Treadmill Run', sets: 1, reps: 1, weight: 0 },
    ],
    duration: '45 min', volume: 0,
  },
  {
    id: 3, date: 'Apr 16', name: 'Pull Day',
    exercises: [
      { name: 'Barbell Row',     sets: 4, reps: 8,  weight: 225 },
      { name: 'Lat Pulldown',    sets: 3, reps: 10, weight: 140 },
      { name: 'Seated Cable Row',sets: 3, reps: 12, weight: 120 },
      { name: 'Face Pull',       sets: 3, reps: 15, weight: 50  },
      { name: 'Barbell Curl',    sets: 3, reps: 10, weight: 95  },
    ],
    duration: '62 min', volume: 28100,
  },
]

function WorkoutCard({ workout }: { workout: typeof MOCK_WORKOUTS[0] }) {
  const [open, setOpen] = useState(false)

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
            <p className="text-xs text-tx-muted">{workout.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-tx-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {workout.duration}
            </span>
            {workout.volume > 0 && (
              <span className="flex items-center gap-1">
                <Weight className="w-3.5 h-3.5" /> {workout.volume.toLocaleString()} lbs
              </span>
            )}
            <span className="flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" /> {workout.exercises.length} exercises
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
              <span className="text-right">Sets × Reps</span>
              <span className="text-right">Weight</span>
            </div>
            {workout.exercises.map((ex, i) => (
              <div key={i} className="grid grid-cols-4 text-sm py-2.5 border-b border-surface-border last:border-0">
                <span className="col-span-2 text-tx-primary font-medium">{ex.name}</span>
                <span className="text-right text-tx-secondary tabular-nums">{ex.sets} × {ex.reps}</span>
                <span className="text-right text-tx-muted tabular-nums">
                  {ex.weight > 0 ? `${ex.weight} lbs` : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 bg-surface-muted">
            <button className="btn-ghost btn-sm">Duplicate</button>
            <button className="btn-secondary btn-sm">Edit</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Workouts() {
  const [search, setSearch] = useState('')

  const filtered = MOCK_WORKOUTS.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  const weekVolume = MOCK_WORKOUTS.reduce((sum, w) => sum + w.volume, 0)

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

      {/* This week summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sessions',    value: '3',                          unit: 'this week',  icon: Dumbbell,  tip: 'Total workouts logged this week' },
          { label: 'Total Volume',value: weekVolume.toLocaleString(),  unit: 'lbs lifted', icon: Weight,    tip: 'Sum of sets × reps × weight across all exercises' },
          { label: 'Avg Duration',value: '55',                         unit: 'min / session', icon: Clock, tip: 'Average workout duration this week' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
              <HelpTip content={s.tip} />
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
            <p className="text-xs text-tx-muted">Try a different search or log a new workout.</p>
          </div>
        ) : (
          filtered.map(w => <WorkoutCard key={w.id} workout={w} />)
        )}
      </div>
    </div>
  )
}
