import { format, subDays, isToday, isSameDay } from 'date-fns'
import {
  TrendingDown, TrendingUp, Dumbbell, Utensils,
  Flame, Target, ChevronRight, Plus, Activity,
  Trophy, Repeat2, Scale, Apple, Timer,
  BarChart3, Beef, Zap, Moon, Award,
  ArrowRight, CheckCircle2, Circle,
} from 'lucide-react'
import { HelpTip } from '../components/Tooltip'

// ─── Mock data ────────────────────────────────────────
const TODAY = new Date()

const MOCK = {
  user:   { name: 'Chris' },
  weight: { current: 185.0, prev7d: 187.0, entries: [187.0, 186.5, 186.2, 185.8, 185.5, 185.2, 185.0] },
  cals:   { eaten: 1850, burned: 2350, target: 2000 },
  macros: { protein: { v: 140, t: 150 }, carbs: { v: 180, t: 250 }, fat: { v: 60, t: 65 } },
  streak: 12,
  weekActivity: [
    { date: subDays(TODAY, 6), type: 'pull',   name: 'Pull Day'  },
    { date: subDays(TODAY, 5), type: 'legs',   name: 'Leg Day'   },
    { date: subDays(TODAY, 4), type: 'rest',   name: 'Rest'      },
    { date: subDays(TODAY, 3), type: 'push',   name: 'Push Day'  },
    { date: subDays(TODAY, 2), type: 'cardio', name: 'Cardio'    },
    { date: subDays(TODAY, 1), type: 'rest',   name: 'Rest'      },
    { date: TODAY,             type: 'push',   name: 'Push Day'  },
  ],
  lastWorkout: {
    name: 'Push Day', duration: '58 min', volume: 32450,
    exercises: [
      { name: 'Bench Press',     sets: 4, reps: 8,  weight: 275, pr: true  },
      { name: 'Incline DB',      sets: 3, reps: 10, weight: 85,  pr: false },
      { name: 'Overhead Press',  sets: 4, reps: 8,  weight: 155, pr: false },
      { name: 'Cable Fly',       sets: 3, reps: 12, weight: 40,  pr: false },
      { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 60,  pr: true  },
    ],
  },
  prs: [
    { exercise: 'Bench Press',    weight: 275, date: 'Today',    improvement: '+5 lbs'  },
    { exercise: 'Tricep Pushdown',weight: 60,  date: 'Today',    improvement: '+5 lbs'  },
    { exercise: 'Barbell Squat',  weight: 315, date: 'Apr 15',   improvement: '+10 lbs' },
  ],
  muscleGroups: [
    { name: 'Chest',     sessions: 2, color: '#00b8d9' },
    { name: 'Back',      sessions: 2, color: '#00b8d9' },
    { name: 'Shoulders', sessions: 1, color: '#0ecef7' },
    { name: 'Legs',      sessions: 1, color: '#0ecef7' },
    { name: 'Arms',      sessions: 2, color: '#00b8d9' },
    { name: 'Core',      sessions: 0, color: '#1c2f50' },
  ],
  weekStats: { totalVolume: 93200, avgDuration: 55, workoutDays: 4 },
}

const WORKOUT_COLORS: Record<string, string> = {
  push:   'text-brand-400',
  pull:   'text-violet-400',
  legs:   'text-success-400',
  cardio: 'text-warning-400',
  rest:   'text-tx-muted',
}
const WORKOUT_ICONS: Record<string, React.ComponentType<any>> = {
  push:   Dumbbell,
  pull:   Dumbbell,
  legs:   Activity,
  cardio: Activity,
  rest:   Moon,
}

// ─── Sub-components ───────────────────────────────────

function WeightSparkline({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 80, h = 28, pad = 2
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + ((max - v) / range) * (h - pad * 2)
    return `${x},${y}`
  })
  const going = values[values.length - 1] < values[0]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={going ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1].split(',')[0]}
        cy={pts[pts.length - 1].split(',')[1]}
        r="2.5"
        fill={going ? '#22c55e' : '#ef4444'}
      />
    </svg>
  )
}

function CalorieRing({ eaten, target }: { eaten: number; target: number }) {
  const pct    = Math.min(1, eaten / target)
  const r      = 28
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-overlay)" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="#00b8d9" strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-base text-tx-primary leading-none tabular-nums">
          {Math.round(pct * 100)}
        </span>
        <span className="text-[10px] text-tx-muted leading-none mt-0.5">%</span>
      </div>
    </div>
  )
}

function MacroBar({ label, icon: Icon, value, target, color, unit = 'g' }: {
  label: string; icon: React.ComponentType<any>; value: number; target: number; color: string; unit?: string
}) {
  const pct = Math.min(100, (value / target) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-tx-secondary">{label}</span>
          <span className="text-xs font-semibold text-tx-primary tabular-nums">
            {value}<span className="text-tx-muted font-normal">/{target}{unit}</span>
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────
export default function Dashboard() {
  const weightDelta = +(MOCK.weight.current - MOCK.weight.prev7d).toFixed(1)
  const weightDown  = weightDelta < 0
  const calBurned   = MOCK.cals.burned - MOCK.cals.eaten
  const hour        = TODAY.getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-tx-muted text-xs font-medium uppercase tracking-wider">
            {format(TODAY, 'EEEE, MMMM d')}
          </p>
          <h1 className="font-display font-bold text-2xl text-tx-primary mt-0.5">
            {greeting}, {MOCK.user.name}
          </h1>
        </div>
        <button className="btn-primary btn-sm">
          <Plus className="w-3.5 h-3.5" /> Quick Log
        </button>
      </div>

      {/* ── Week activity strip ─────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="stat-label">This Week</span>
            <HelpTip content="Your training split for the past 7 days" />
          </div>
          <div className="flex items-center gap-1 text-xs text-tx-muted">
            <Repeat2 className="w-3.5 h-3.5 text-brand-500" />
            <span className="font-semibold text-brand-400">{MOCK.streak}</span>
            <span>day streak</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {MOCK.weekActivity.map((day, i) => {
            const Icon      = WORKOUT_ICONS[day.type]
            const colorCls  = WORKOUT_COLORS[day.type]
            const isNow     = isToday(day.date)
            const isRest    = day.type === 'rest'
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className={`text-[10px] font-medium uppercase ${isNow ? 'text-brand-400' : 'text-tx-muted'}`}>
                  {format(day.date, 'EEE')}
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isNow
                    ? 'bg-brand-500/15 border border-brand-500/40'
                    : isRest
                    ? 'bg-surface-overlay border border-surface-border'
                    : 'bg-surface-muted border border-surface-border'
                }`}>
                  <Icon className={`w-3.5 h-3.5 ${colorCls}`} strokeWidth={isRest ? 1.5 : 2} />
                </div>
                <span className={`text-[10px] text-center leading-tight hidden sm:block ${isNow ? 'text-brand-400 font-medium' : 'text-tx-muted'}`}>
                  {isRest ? 'Rest' : day.name.split(' ')[0]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Top stat cards ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Weight */}
        <div className="card p-4 border-brand-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Body Weight</span>
            <Scale className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-end gap-1">
                <span className="stat-value text-2xl">{MOCK.weight.current}</span>
                <span className="text-tx-muted text-xs mb-0.5">lbs</span>
              </div>
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${weightDown ? 'text-success-400' : 'text-error-400'}`}>
                {weightDown ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                {Math.abs(weightDelta)} lbs / 7d
              </div>
            </div>
            <WeightSparkline values={MOCK.weight.entries} />
          </div>
        </div>

        {/* Calories */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Calories</span>
            <Flame className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{MOCK.cals.eaten.toLocaleString()}</span>
            <span className="text-tx-muted text-xs mb-0.5">/ {MOCK.cals.target.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-tx-muted">
            <Zap className="w-3.5 h-3.5 text-warning-400" />
            <span>{calBurned > 0 ? `${calBurned} kcal deficit` : `${Math.abs(calBurned)} kcal surplus`}</span>
          </div>
        </div>

        {/* Weekly volume */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Weekly Volume</span>
            <BarChart3 className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{(MOCK.weekStats.totalVolume / 1000).toFixed(0)}k</span>
            <span className="text-tx-muted text-xs mb-0.5">lbs</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-tx-muted">
            <Timer className="w-3.5 h-3.5" />
            <span>{MOCK.weekStats.avgDuration} min avg · {MOCK.weekStats.workoutDays} sessions</span>
          </div>
        </div>

        {/* PRs this week */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">New PRs</span>
            <Trophy className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{MOCK.prs.filter(p => p.date === 'Today').length}</span>
            <span className="text-tx-muted text-xs mb-0.5">today</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-warning-400 font-medium">
            <Award className="w-3.5 h-3.5" />
            <span>{MOCK.prs.length} this week</span>
          </div>
        </div>
      </div>

      {/* ── Middle row ─────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Today's nutrition */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <h2 className="section-title">Today's Nutrition</h2>
              <HelpTip content="Macros logged so far today vs. your daily targets" />
            </div>
            <button className="btn-ghost btn-sm">
              <Utensils className="w-3.5 h-3.5" /> Log meal
            </button>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1">
              <CalorieRing eaten={MOCK.cals.eaten} target={MOCK.cals.target} />
              <span className="text-[10px] text-tx-muted">of goal</span>
            </div>
            <div className="flex-1 space-y-3">
              <MacroBar label="Protein" icon={Beef}     value={MOCK.macros.protein.v} target={MOCK.macros.protein.t} color="#00b8d9" />
              <MacroBar label="Carbs"   icon={Apple}    value={MOCK.macros.carbs.v}   target={MOCK.macros.carbs.t}   color="#f59e0b" />
              <MacroBar label="Fat"     icon={Flame}    value={MOCK.macros.fat.v}     target={MOCK.macros.fat.t}     color="#8b5cf6" />
            </div>
          </div>

          <div className="mt-4 pt-4 divider grid grid-cols-3 gap-2">
            {[
              { label: 'Eaten',     value: MOCK.cals.eaten,  color: 'text-tx-primary' },
              { label: 'Burned',    value: MOCK.cals.burned, color: 'text-success-400' },
              { label: 'Remaining', value: MOCK.cals.target - MOCK.cals.eaten, color: 'text-brand-400' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-sm font-semibold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-tx-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Last workout */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <h2 className="section-title">{MOCK.lastWorkout.name}</h2>
              <span className="badge-dim">Today</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-tx-muted">
              <Timer className="w-3.5 h-3.5" />
              {MOCK.lastWorkout.duration}
            </div>
          </div>

          <div className="space-y-0 divide-y divide-surface-border">
            {MOCK.lastWorkout.exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  {ex.pr
                    ? <Trophy className="w-3.5 h-3.5 text-warning-400 flex-shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-tx-muted flex-shrink-0" />
                  }
                  <span className={`text-sm ${ex.pr ? 'text-tx-primary font-medium' : 'text-tx-secondary'}`}>
                    {ex.name}
                  </span>
                  {ex.pr && <span className="badge-brand text-[10px] px-1.5 py-0.5">PR</span>}
                </div>
                <span className="text-xs text-tx-muted tabular-nums">
                  {ex.sets}×{ex.reps} @ {ex.weight} lbs
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 divider flex items-center justify-between">
            <span className="text-xs text-tx-muted">
              Total volume: <span className="font-semibold text-tx-primary">{MOCK.lastWorkout.volume.toLocaleString()} lbs</span>
            </span>
            <a href="/workouts" className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors">
              Full log <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* ── Bottom row ─────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Muscle group frequency */}
        <div className="card p-5">
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="section-title">Muscle Groups</h2>
            <HelpTip content="Sessions per muscle group this week. Aim for each group 2× per week." />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MOCK.muscleGroups.map(mg => (
              <div key={mg.name} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-surface-muted border border-surface-border">
                <div className="flex gap-0.5">
                  {[1, 2].map(n => (
                    <div
                      key={n}
                      className="w-2 h-2 rounded-full"
                      style={{ background: mg.sessions >= n ? mg.color : 'var(--surface-border)' }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-tx-secondary">{mg.name}</span>
                <span className="text-[10px] text-tx-muted">{mg.sessions}× / wk</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent PRs */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <h2 className="section-title">Personal Records</h2>
              <HelpTip content="Your most recent all-time weight PRs" />
            </div>
            <Trophy className="w-4 h-4 text-warning-400" />
          </div>
          <div className="space-y-0 divide-y divide-surface-border">
            {MOCK.prs.map((pr, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-warning-500/10 border border-warning-500/20 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-3.5 h-3.5 text-warning-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-tx-primary">{pr.exercise}</p>
                    <p className="text-xs text-tx-muted">{pr.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-tx-primary tabular-nums">{pr.weight} lbs</p>
                  <p className="text-xs text-success-400 font-medium">{pr.improvement}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 divider">
            <a href="/workouts" className="flex items-center justify-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors">
              View all records <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}
