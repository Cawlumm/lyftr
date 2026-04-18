import { format } from 'date-fns'
import {
  TrendingDown, TrendingUp, Dumbbell, Utensils,
  Flame, Target, ChevronRight, Plus,
} from 'lucide-react'

const MOCK = {
  weight: 185,
  weightTrend: -2,
  calories: 1850,
  caloriesTarget: 2000,
  protein: { value: 140, target: 150 },
  carbs:   { value: 180, target: 250 },
  fat:     { value: 60,  target: 65  },
  workouts: [
    { id: 1, name: 'Push Day',  exercises: 6, volume: '32,450 lbs', ago: '2h ago' },
    { id: 2, name: 'Cardio',    exercises: 1, volume: '5.2 mi',     ago: '1d ago' },
    { id: 3, name: 'Pull Day',  exercises: 5, volume: '28,100 lbs', ago: '2d ago' },
  ],
}

function StatCard({
  label, value, unit, meta, metaColor = 'text-slate-500', accent = false
}: {
  label: string
  value: string | number
  unit?: string
  meta?: React.ReactNode
  metaColor?: string
  accent?: boolean
}) {
  return (
    <div className={`card p-5 ${accent ? 'border-brand-500/30 bg-brand-500/5' : ''}`}>
      <p className="stat-label mb-3">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className="stat-value text-2xl">{value}</span>
        {unit && <span className="text-slate-500 text-sm mb-0.5">{unit}</span>}
      </div>
      {meta && <div className={`flex items-center gap-1.5 mt-2.5 text-xs font-medium ${metaColor}`}>{meta}</div>}
    </div>
  )
}

function MacroRow({
  label, value, target, color
}: {
  label: string; value: number; target: number; color: string
}) {
  const pct = Math.min(100, (value / target) * 100)
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-semibold text-slate-300 tabular-nums">
          {value}<span className="text-slate-600 font-normal">/{target}g</span>
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const calRemaining = MOCK.caloriesTarget - MOCK.calories

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="font-display font-bold text-2xl text-white mt-0.5">Dashboard</h1>
        </div>
        <button className="btn-secondary btn-sm">
          <Plus className="w-3.5 h-3.5" /> Log
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Weight"
          value={MOCK.weight}
          unit="lbs"
          accent
          meta={
            <>
              {MOCK.weightTrend < 0
                ? <TrendingDown className="w-3.5 h-3.5" />
                : <TrendingUp className="w-3.5 h-3.5" />
              }
              {Math.abs(MOCK.weightTrend)} lbs this week
            </>
          }
          metaColor={MOCK.weightTrend < 0 ? 'text-success-400' : 'text-error-400'}
        />
        <StatCard
          label="Calories"
          value={MOCK.calories.toLocaleString()}
          unit="kcal"
          meta={<><Flame className="w-3.5 h-3.5" />{calRemaining} remaining</>}
          metaColor="text-slate-400"
        />
        <StatCard
          label="Sessions"
          value="3"
          unit="/ week"
          meta={<><Target className="w-3.5 h-3.5" />Goal: 4</>}
          metaColor="text-slate-400"
        />
        <StatCard
          label="Streak"
          value="12"
          unit="days"
          meta={<><Flame className="w-3.5 h-3.5" />Personal best</>}
          metaColor="text-brand-400"
        />
      </div>

      {/* Main content row */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Nutrition */}
        <div className="card p-5">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-sm font-semibold text-white">Today's Nutrition</h2>
            <button className="btn-ghost btn-sm">
              <Utensils className="w-3.5 h-3.5" /> Log meal
            </button>
          </div>

          <div className="space-y-4">
            <MacroRow label="Protein" {...MOCK.protein} color="#00b8d9" />
            <MacroRow label="Carbs"   {...MOCK.carbs}   color="#f59e0b" />
            <MacroRow label="Fat"     {...MOCK.fat}      color="#8b5cf6" />
          </div>

          <div className="mt-5 pt-4 border-t border-surface-border flex justify-between items-center">
            <span className="text-xs text-slate-500">Total calories</span>
            <span className="text-sm font-semibold text-white tabular-nums">
              {MOCK.calories.toLocaleString()}
              <span className="text-slate-500 font-normal"> / {MOCK.caloriesTarget.toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Recent workouts */}
        <div className="card p-5">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-sm font-semibold text-white">Recent Workouts</h2>
            <button className="btn-ghost btn-sm">
              <Dumbbell className="w-3.5 h-3.5" /> Log workout
            </button>
          </div>

          <div className="space-y-1">
            {MOCK.workouts.map(w => (
              <div
                key={w.id}
                className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-surface-border flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="w-3.5 h-3.5 text-brand-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{w.name}</p>
                    <p className="text-xs text-slate-500">{w.exercises} exercises · {w.volume}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">{w.ago}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-4 border-t border-surface-border">
            <a href="/workouts" className="flex items-center justify-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors">
              View all workouts <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
