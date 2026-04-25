import { useState, useEffect } from 'react'
import { format, startOfWeek, isSameDay, eachDayOfInterval, endOfWeek, subWeeks } from 'date-fns'
import {
  Dumbbell, Flame, ArrowRight, Beef,
  AlertCircle, Play, Timer, TrendingUp, Scale, Activity, Plus,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie, Legend,
} from 'recharts'
import Loading from '../components/Loading'
import QuickWeighInSheet from '../components/QuickWeighInSheet'
import { workoutAPI, foodAPI, weightAPI, userAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore, weightShort } from '../stores/settings'
import { useNavigate, Link } from 'react-router-dom'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

const TODAY = new Date()

function greeting() {
  const h = TODAY.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const calcVolume = (w: types.Workout) =>
  (w.exercises ?? []).reduce((s, ex) => s + (ex.sets ?? []).reduce((ss, set) => ss + set.reps * set.weight, 0), 0)

const DEFAULT_FOOD: types.DailyStats = {
  date: format(TODAY, 'yyyy-MM-dd'),
  total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, workout_count: 0,
}
const DEFAULT_SETTINGS: types.UserSettings = {
  user_id: 0, weight_unit: 'lbs', calorie_target: 2000,
  protein_target: 150, carb_target: 250, fat_target: 65,
}

// Hex colors for recharts (can't use Tailwind classes)
const MUSCLE_HEX: Record<string, string> = {
  chest:       '#f87171',
  back:        '#60a5fa',
  shoulders:   '#818cf8',
  biceps:      '#f472b6',
  triceps:     '#a78bfa',
  legs:        '#34d399',
  quadriceps:  '#34d399',
  hamstrings:  '#6ee7b7',
  glutes:      '#86efac',
  calves:      '#4ade80',
  core:        '#fbbf24',
  abs:         '#fbbf24',
  forearms:    '#fb923c',
  traps:       '#94a3b8',
  lats:        '#38bdf8',
  'full body': '#e879f9',
}
const muscleHex = (m: string) => MUSCLE_HEX[m?.toLowerCase()] ?? '#6366f1'

const MUSCLE_ROAST: Record<string, string> = {
  chest:       'All chest, no legs. Classic bro.',
  back:        'Built like a refrigerator. Respect.',
  shoulders:   "Can't fit through doorways. Good.",
  biceps:      'Mirror selfies loading…',
  triceps:     'Horseshoe gang. Handshakes must be terrifying.',
  legs:        "Actually training legs. You're a unicorn.",
  quadriceps:  "Quads for days. Jeans don't stand a chance.",
  hamstrings:  'Posterior chain warrior. Deadlift god incoming.',
  glutes:      'Glute guy/gal. We respect the commitment.',
  calves:      'Calf king/queen. The rarest of all lifters.',
  core:        'Beach season ready 365 days a year.',
  abs:         'Six pack incoming. Or already here. Either way.',
  forearms:    'Popeye called. He wants his arms back.',
  traps:       'No neck, no problem.',
  lats:        'Walking around like a cobra. Wings deployed.',
  'full body': 'A true all-rounder. Or you just did burpees.',
}
const muscleRoast = (m: string) => MUSCLE_ROAST[m?.toLowerCase()] ?? 'Mysterious training patterns. We respect it.'

function MuscleSparkline({ values, color, isTop }: { values: number[], color: string, isTop: boolean }) {
  if (values.length < 2) return <div className="w-14 h-6 flex-shrink-0" />
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const W = 56, H = 24
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - 4 - ((v - min) / range) * (H - 8),
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  // Filled area path
  const area = `${d} L${W},${H} L0,${H} Z`
  return (
    <svg width={W} height={H} className="flex-shrink-0 overflow-visible">
      {isTop && (
        <path d={area} fill={color} fillOpacity={0.12} />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={isTop ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={isTop ? 1 : 0.6}
      />
      {/* End dot */}
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={isTop ? 2.5 : 1.5}
        fill={color}
        fillOpacity={isTop ? 1 : 0.7}
      />
    </svg>
  )
}

const TOOLTIP_STYLE = {
  background: 'var(--color-surface-raised, #1e1e2e)',
  border: '1px solid var(--color-surface-border, #2d2d3a)',
  borderRadius: 8,
  fontSize: 11,
  color: 'var(--color-tx-primary, #f1f5f9)',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { session } = useWorkoutSession()
  const { user } = useAuthStore()
  const { settings: storedSettings } = useSettingsStore()

  const [workouts, setWorkouts] = useState<types.Workout[]>([])
  const [food, setFood] = useState<types.DailyStats>(DEFAULT_FOOD)
  const [weightLogs, setWeightLogs] = useState<types.WeightLog[]>([])
  const [weightStats, setWeightStats] = useState<types.WeightStats | null>(null)
  const [settings, setSettings] = useState<types.UserSettings>(storedSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const wUnit = weightShort(settings.weight_unit)

  useEffect(() => {
    Promise.all([
      workoutAPI.list({ limit: 84 }),  // 12 weeks × 7 days max
      foodAPI.stats(format(TODAY, 'yyyy-MM-dd')).catch(() => DEFAULT_FOOD),
      weightAPI.list({ limit: 14 }).catch(() => []),
      weightAPI.stats().catch(() => null),
      userAPI.getSettings().catch(() => DEFAULT_SETTINGS),
    ])
      .then(([ws, fs, wl, wst, s]) => {
        setWorkouts(ws || [])
        setFood(fs || DEFAULT_FOOD)
        setWeightLogs(wl || [])
        setWeightStats(wst)
        setSettings(s || DEFAULT_SETTINGS)
      })
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  if (error) {
    return (
      <div className="alert-error">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  // ── Derived data ────────────────────────────────
  const weekStart = startOfWeek(TODAY, { weekStartsOn: 1 })
  const weekWorkouts = workouts.filter(w => new Date(w.started_at) >= weekStart)
  const lastWorkout = workouts[0] ?? null

  // Volume chart: last 7 workouts oldest→newest
  const chartData = workouts.slice(0, 7).reverse().map(w => ({
    date: format(new Date(w.started_at), 'M/d'),
    volume: Math.round(calcVolume(w)),
    name: w.name,
  }))

  // Current week dots
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(TODAY, { weekStartsOn: 1 }) })

  // Heatmap: 12 weeks, Mon–Sun columns
  const heatmapStart = startOfWeek(subWeeks(TODAY, 11), { weekStartsOn: 1 })
  const heatmapEnd   = endOfWeek(TODAY, { weekStartsOn: 1 })
  const heatmapDays  = eachDayOfInterval({ start: heatmapStart, end: heatmapEnd })
  // map dateString → count
  const workoutDayMap = new Map<string, number>()
  workouts.forEach(w => {
    const k = format(new Date(w.started_at), 'yyyy-MM-dd')
    workoutDayMap.set(k, (workoutDayMap.get(k) || 0) + 1)
  })
  // chunk into weeks
  const heatmapWeeks: Date[][] = []
  for (let i = 0; i < heatmapDays.length; i += 7) {
    heatmapWeeks.push(heatmapDays.slice(i, i + 7))
  }
  // month labels: show month name on first week that starts in that month
  const monthLabels: (string | null)[] = heatmapWeeks.map((week, i) => {
    const m = format(week[0], 'MMM')
    if (i === 0) return m
    const prev = format(heatmapWeeks[i - 1][0], 'MMM')
    return m !== prev ? m : null
  })

  // Muscle group donut: sets per muscle across all fetched workouts
  const muscleMap = new Map<string, number>()
  workouts.forEach(w => {
    (w.exercises ?? []).forEach(ex => {
      const mg = ex.exercise?.muscle_group || 'other'
      muscleMap.set(mg, (muscleMap.get(mg) || 0) + (ex.sets ?? []).length)
    })
  })
  const muscleData = Array.from(muscleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) // top 8 groups
    .map(([name, value]) => ({ name, value }))
  const totalMuscSets = muscleData.reduce((s, d) => s + d.value, 0)

  // Sparklines: sets per muscle per workout (last 10, oldest→newest)
  const sparklineWorkouts = workouts.slice(0, 10).reverse()
  const muscleSparklines = new Map<string, number[]>()
  muscleData.forEach(({ name }) => {
    muscleSparklines.set(name, sparklineWorkouts.map(w =>
      (w.exercises ?? [])
        .filter(ex => ex.exercise?.muscle_group === name)
        .reduce((s, ex) => s + (ex.sets ?? []).length, 0)
    ))
  })
  const topMuscle = muscleData[0]?.name ?? null

  // Nutrition %
  const calPct   = Math.min(100, (food.total_calories / settings.calorie_target) * 100) || 0
  const protPct  = Math.min(100, (food.total_protein  / settings.protein_target)  * 100) || 0
  const carbsPct = Math.min(100, (food.total_carbs    / settings.carb_target)     * 100) || 0
  const fatPct   = Math.min(100, (food.total_fat      / settings.fat_target)      * 100) || 0

  // Weight sparkline
  const sparkData = [...weightLogs].reverse().map(l => ({
    date: format(new Date(l.logged_at), 'M/d'),
    weight: l.weight,
  }))

  const username = user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-tx-muted uppercase tracking-wider font-medium">
            {format(TODAY, 'EEEE, MMMM d')}
          </p>
          <h1 className="font-display font-bold text-2xl text-tx-primary mt-0.5">
            {greeting()}, {username}
          </h1>
        </div>
        <button
          onClick={() => navigate('/workout/start')}
          className="btn-primary btn-sm flex-shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          {session ? 'Resume' : 'Start'}
        </button>
      </div>

      {/* ── Active session banner ──────────────────── */}
      {session && (
        <Link
          to="/workout/active"
          className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">Workout in progress</p>
              <p className="text-xs text-amber-400/70">{session.name} — tap to resume</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
        </Link>
      )}

      {/* ── KPI strip ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-tx-muted uppercase tracking-wide font-medium">Week</span>
            <Dumbbell className="w-3 h-3 text-tx-muted" />
          </div>
          <p className="text-xl font-bold text-tx-primary leading-none">{weekWorkouts.length}</p>
          <p className="text-[10px] text-tx-muted">sessions</p>
        </div>

        <div className="card p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-tx-muted uppercase tracking-wide font-medium">Cals</span>
            <Flame className="w-3 h-3 text-tx-muted" />
          </div>
          <p className="text-xl font-bold text-tx-primary leading-none">
            {Math.round(food.total_calories)}
          </p>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${calPct}%`, background: '#00b8d9' }} />
          </div>
        </div>

        <div className="card p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-tx-muted uppercase tracking-wide font-medium">Protein</span>
            <Beef className="w-3 h-3 text-tx-muted" />
          </div>
          <p className="text-xl font-bold text-tx-primary leading-none">
            {Math.round(food.total_protein)}<span className="text-xs text-tx-muted font-normal">g</span>
          </p>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${protPct}%`, background: '#f59e0b' }} />
          </div>
        </div>
      </div>

      {/* ── Volume trend chart ─────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-500" />
            <h2 className="section-title">Volume Trend</h2>
          </div>
          <span className="text-xs text-tx-muted">
            {chartData.length > 0 ? `last ${chartData.length} workouts` : ''}
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Dumbbell className="w-6 h-6 text-tx-muted opacity-40" />
            <p className="text-xs text-tx-muted">Log workouts to see trends</p>
          </div>
        ) : (
          <>
            <div className="w-full min-w-0">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={chartData} barSize={18} barCategoryGap="30%">
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-tx-muted, #9ca3af)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [`${v.toLocaleString()} ${wUnit}`, 'Volume']}
                  labelFormatter={(label: string) => chartData.find(d => d.date === label)?.name || label}
                  cursor={{ fill: 'rgba(99,102,241,0.08)', radius: 4 }}
                />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#6366f1" fillOpacity={i === chartData.length - 1 ? 1 : 0.25} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>

            {/* Current week day dots */}
            <div className="flex items-center justify-between mt-4 px-1">
              {weekDays.map((day, i) => {
                const hasWorkout = workouts.some(w => isSameDay(new Date(w.started_at), day))
                const isToday = isSameDay(day, TODAY)
                const isFuture = day > TODAY
                return (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <span className={`text-[10px] font-semibold ${isToday ? 'text-brand-400' : 'text-tx-muted'}`}>
                      {format(day, 'EEEEE')}
                    </span>
                    <div className={`w-3 h-3 rounded-full transition-all ${
                      hasWorkout   ? 'bg-brand-500 shadow-sm shadow-brand-500/50' :
                      isToday      ? 'bg-transparent ring-2 ring-brand-500/60' :
                      isFuture     ? 'bg-surface-border/20' :
                                     'bg-surface-border/60'
                    }`} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Frequency heatmap ──────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-500" />
            <h2 className="section-title">Consistency</h2>
          </div>
          <span className="text-xs text-tx-muted">12 weeks</span>
        </div>

        {workouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-xs text-tx-muted">Start working out to build your streak</p>
          </div>
        ) : (
          <>
            {/* CSS grid: 1 auto col (day labels) + N 1fr cols (weeks) */}
            <div
              className="w-full"
              style={{ display: 'grid', gridTemplateColumns: `1.25rem repeat(${heatmapWeeks.length}, 1fr)`, gap: '2px' }}
            >
              {/* Row 0: spacer + month labels */}
              <div />
              {heatmapWeeks.map((_, i) => (
                <div key={i} className="text-[9px] text-tx-muted font-medium overflow-visible whitespace-nowrap leading-none pb-0.5">
                  {monthLabels[i] ?? ''}
                </div>
              ))}

              {/* Rows 1–7: day label + cells */}
              {(['M', '', 'W', '', 'F', '', 'S'] as const).map((lbl, dayIdx) => (
                [
                  <div key={`lbl-${dayIdx}`} className="text-[9px] text-tx-muted/60 font-medium flex items-center leading-none">
                    {lbl}
                  </div>,
                  ...heatmapWeeks.map((week, wi) => {
                    const day    = week[dayIdx]
                    const k      = format(day, 'yyyy-MM-dd')
                    const count  = workoutDayMap.get(k) || 0
                    const future = day > TODAY
                    return (
                      <div
                        key={`${wi}-${dayIdx}`}
                        title={`${format(day, 'MMM d')}${count > 0 ? ` · ${count} workout${count > 1 ? 's' : ''}` : ''}`}
                        className={`h-3 rounded-[2px] transition-colors ${
                          future      ? 'bg-surface-muted/20' :
                          count === 0 ? 'bg-surface-muted/50' :
                          count === 1 ? 'bg-brand-500/50' :
                                        'bg-brand-500'
                        }`}
                      />
                    )
                  }),
                ]
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-2 justify-end">
              <span className="text-[9px] text-tx-muted">Less</span>
              {['bg-surface-muted/50', 'bg-brand-500/30', 'bg-brand-500/60', 'bg-brand-500'].map((cls, i) => (
                <div key={i} className={`w-3 h-3 rounded-[3px] ${cls}`} />
              ))}
              <span className="text-[9px] text-tx-muted">More</span>
            </div>
          </>
        )}
      </div>

      {/* ── Last workout + Nutrition ───────────────── */}
      <div className="grid lg:grid-cols-2 gap-4 min-w-0">

        {lastWorkout ? (() => {
          const exs = lastWorkout.exercises ?? []
          const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)
          const totalVolume = Math.round(calcVolume(lastWorkout))
          const mins = Math.round(lastWorkout.duration / 60)
          return (
            <div className="card p-4 overflow-hidden min-w-0 cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => navigate(`/workouts/${lastWorkout.id}`)}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tx-primary truncate">{lastWorkout.name}</p>
                  <p className="text-xs text-tx-muted mt-0.5">
                    {format(new Date(lastWorkout.started_at), 'MMM d')}
                    {mins > 0 && ` · ${mins} min`}
                    {totalSets > 0 && ` · ${totalSets} sets`}
                    {totalVolume > 0 && ` · ${totalVolume.toLocaleString()} ${wUnit}`}
                  </p>
                </div>
                <Link to="/workouts" className="flex items-center gap-0.5 text-xs text-brand-400 hover:text-brand-300 flex-shrink-0 transition-colors">
                  All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="divide-y divide-surface-border/60">
                {exs.slice(0, 4).map((ex) => {
                  const sets = ex.sets ?? []
                  const best = sets.length > 0
                    ? sets.reduce((b, s) => s.weight > b.weight ? s : b, sets[0])
                    : null
                  return (
                    <div key={ex.id} className="flex items-center gap-2.5 py-2.5">
                      {ex.exercise.image_url ? (
                        <img
                          src={ex.exercise.image_url}
                          alt=""
                          loading="lazy"
                          className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-surface-muted"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                          <Dumbbell className="w-3.5 h-3.5 text-brand-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-tx-secondary truncate">{ex.exercise.name}</p>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${muscleColor(ex.exercise.muscle_group)}`}>
                          {ex.exercise.muscle_group}
                        </span>
                      </div>
                      {best && (
                        <span className="text-xs text-tx-muted tabular-nums flex-shrink-0">
                          {sets.length}×{best.weight > 0 ? ` ${best.weight}${wUnit}` : ' BW'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {exs.length > 4 && (
                <p className="text-xs text-tx-muted text-center pt-2">
                  +{exs.length - 4} more exercises
                </p>
              )}
            </div>
          )
        })() : (
          <div className="card p-4 flex flex-col items-center justify-center min-h-36 gap-2">
            <Dumbbell className="w-7 h-7 text-tx-muted opacity-40" />
            <p className="text-sm text-tx-muted">No workouts logged yet</p>
            <button
              onClick={() => navigate('/workout/start')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors mt-1"
            >
              Start your first workout →
            </button>
          </div>
        )}

        {/* Nutrition */}
        <div className="card p-4 overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Today's Nutrition</h2>
            <Link to="/food" className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex-shrink-0">
              Log →
            </Link>
          </div>

          {/* Calorie total */}
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-3xl font-bold text-tx-primary tabular-nums leading-none">
              {Math.round(food.total_calories)}
            </span>
            <span className="text-xs text-tx-muted">/ {settings.calorie_target} kcal</span>
            <div className="flex-1" />
            <span className="text-xs text-tx-muted tabular-nums">{Math.round(calPct)}%</span>
          </div>
          <div className="progress-track mb-4">
            <div className="progress-bar" style={{ width: `${calPct}%`, background: '#00b8d9' }} />
          </div>

          {/* Macros */}
          <div className="space-y-2.5">
            {[
              { label: 'Protein', val: food.total_protein, target: settings.protein_target, pct: protPct,  color: '#3b82f6' },
              { label: 'Carbs',   val: food.total_carbs,   target: settings.carb_target,    pct: carbsPct, color: '#f59e0b' },
              { label: 'Fat',     val: food.total_fat,     target: settings.fat_target,     pct: fatPct,   color: '#8b5cf6' },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-tx-muted">{m.label}</span>
                  <span className="text-xs font-semibold text-tx-primary tabular-nums">
                    {Math.round(m.val)}g
                    <span className="text-tx-muted font-normal"> / {m.target}g</span>
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Muscle group balance ────────────────────── */}
      <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-brand-500" />
              <h2 className="section-title">Muscle Balance</h2>
            </div>
            <span className="text-xs text-tx-muted">{workouts.length} workouts</span>
          </div>

          {topMuscle ? (
            <p className="text-xs text-tx-muted mb-3 italic">
              {muscleRoast(topMuscle)}
            </p>
          ) : (
            <p className="text-xs text-tx-muted mb-3">Log workouts to see which muscles you train most.</p>
          )}

          {muscleData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Dumbbell className="w-6 h-6 text-tx-muted opacity-30" />
              <p className="text-xs text-tx-muted">No workout data yet</p>
            </div>
          ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Donut */}
            <div className="flex-shrink-0 flex items-center justify-center">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={muscleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={68}
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={2}
                  >
                    {muscleData.map((entry, i) => (
                      <Cell key={i} fill={muscleHex(entry.name)} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, _: string, props: { payload?: { name: string } }) => [
                      `${v} sets (${Math.round((v / totalMuscSets) * 100)}%)`,
                      props.payload?.name ?? '',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend — muscle name + sparkline + set count */}
            <div className="flex-1 w-full min-w-0 space-y-2">
              {muscleData.map((d) => {
                const pct    = Math.round((d.value / totalMuscSets) * 100)
                const isTop  = d.name === topMuscle
                const values = muscleSparklines.get(d.name) ?? []
                const color  = muscleHex(d.name)
                return (
                  <div key={d.name}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className={`text-xs capitalize flex-1 min-w-0 truncate ${isTop ? 'font-semibold text-tx-primary' : 'text-tx-secondary'}`}>
                        {d.name}
                        {isTop && <span className="ml-1 text-[9px] font-normal text-tx-muted uppercase tracking-wide">top</span>}
                      </span>
                      <MuscleSparkline values={values} color={color} isTop={isTop} />
                      <span className="text-xs text-tx-muted tabular-nums w-16 text-right flex-shrink-0">
                        {d.value} · {pct}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-bar transition-all" style={{ width: `${pct}%`, background: color, opacity: isTop ? 1 : 0.6 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )}
      </div>

      {/* ── Weight quick-log card ──────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-500" />
            <h2 className="section-title">Weight</h2>
          </div>
          <Link to="/weight" className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-0.5">
            View <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {weightLogs.length === 0 ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="w-full flex items-center gap-3 p-3 bg-brand-500/5 border border-dashed border-brand-500/30 rounded-xl hover:bg-brand-500/10 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tx-primary">Log your first weight</p>
              <p className="text-xs text-tx-muted">Tap to start tracking</p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="w-full text-left active:scale-[0.99] transition-transform"
            aria-label="Log weight"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-tx-primary tabular-nums leading-none">
                  {weightLogs[0].weight.toFixed(1)}
                </span>
                <span className="text-sm text-tx-muted">{wUnit}</span>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const delta = weightStats?.change_7d ?? 0
                  if (delta === 0) {
                    return <span className="text-xs text-tx-muted">7d · no change</span>
                  }
                  return (
                    <span className={`text-xs tabular-nums ${delta < 0 ? 'text-success-400' : 'text-error-400'}`}>
                      7d · {delta < 0 ? '↓' : '↑'}{Math.abs(delta).toFixed(1)} {wUnit}
                    </span>
                  )
                })()}
                <span className="w-7 h-7 rounded-lg bg-brand-500 hover:bg-brand-600 flex items-center justify-center text-white shadow-sm">
                  <Plus className="w-4 h-4" />
                </span>
              </div>
            </div>
            {weightLogs.length >= 2 && (
              <div className="w-full min-w-0">
                <ResponsiveContainer width="100%" height={48}>
                  <LineChart data={sparkData}>
                    <Line dataKey="weight" dot={false} stroke="#6366f1" strokeWidth={2} type="monotone" />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => [`${v} ${wUnit}`, 'Weight']}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </button>
        )}
      </div>

      <QuickWeighInSheet
        isOpen={sheetOpen}
        lastValue={weightLogs[0]?.weight ?? null}
        onClose={() => setSheetOpen(false)}
        onSuccess={(log) => {
          setWeightLogs(prev => [log, ...prev])
          weightAPI.stats().then(setWeightStats).catch(() => {})
        }}
      />

    </div>
  )
}
