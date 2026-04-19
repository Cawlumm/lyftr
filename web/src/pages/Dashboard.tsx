import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Dumbbell, Utensils, Flame, Plus,
  Apple, Beef, Zap, ArrowRight,
  CheckCircle2, AlertCircle, Play, Timer,
} from 'lucide-react'
import Loading from '../components/Loading'
import { workoutAPI, foodAPI, weightAPI, userAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { useNavigate, Link } from 'react-router-dom'
import * as types from '../types'

const TODAY = new Date()

export default function Dashboard() {
  const navigate = useNavigate()
  const { session } = useWorkoutSession()
  const [stats, setStats] = useState<{
    weight?: types.WeightLog | null
    weightStats?: types.WeightStats
    food?: types.DailyStats
    workouts: types.Workout[]
    settings?: types.UserSettings
  }>({
    workouts: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [workouts, foodStats, weightStats, settings] = await Promise.all([
          workoutAPI.list({ limit: 10 }),
          foodAPI.stats(format(TODAY, 'yyyy-MM-dd')).catch(() => ({
            date: format(TODAY, 'yyyy-MM-dd'),
            total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, workout_count: 0
          })),
          weightAPI.stats().catch(() => ({ latest: 0, starting: 0, total_entries: 0 })),
          userAPI.getSettings().catch(() => ({
            user_id: 0, weight_unit: 'lbs' as const, calorie_target: 2000,
            protein_target: 150, carb_target: 250, fat_target: 65
          })),
        ])

        setStats({
          workouts: workouts || [],
          food: foodStats,
          weightStats,
          settings,
          weight: workouts?.[0] ? null : null, // Placeholder
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

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

  const lastWorkout = stats.workouts[0]
  const foodData = stats.food
  const settings = stats.settings!
  const calBurned = (foodData?.total_calories || 0) - settings.calorie_target
  const proteinPct = Math.min(100, ((foodData?.total_protein || 0) / settings.protein_target) * 100)
  const carbsPct = Math.min(100, ((foodData?.total_carbs || 0) / settings.carb_target) * 100)
  const fatPct = Math.min(100, ((foodData?.total_fat || 0) / settings.fat_target) * 100)
  const calPct = Math.min(100, ((foodData?.total_calories || 0) / settings.calorie_target) * 100)

  return (
    <div className="space-y-4 animate-slide-up">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-tx-muted text-xs font-medium uppercase tracking-wider">
            {format(TODAY, 'EEEE, MMMM d')}
          </p>
          <h1 className="font-display font-bold text-2xl text-tx-primary mt-0.5">
            Your progress today
          </h1>
        </div>
        <button
          onClick={() => navigate(session ? '/workout/active' : '/workout/start')}
          className="btn-primary btn-sm"
        >
          <Play className="w-3.5 h-3.5" /> {session ? 'Resume' : 'Start Workout'}
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
          <ArrowRight className="w-4 h-4 text-amber-400" />
        </Link>
      )}

      {/* ── Top stat cards ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Calories */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Calories</span>
            <Flame className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{Math.round(foodData?.total_calories || 0)}</span>
            <span className="text-tx-muted text-xs mb-0.5">/ {settings.calorie_target}</span>
          </div>
          <div className="progress-track mt-2">
            <div className="progress-bar" style={{ width: `${calPct}%`, background: '#00b8d9' }} />
          </div>
        </div>

        {/* Protein */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Protein</span>
            <Beef className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{Math.round(foodData?.total_protein || 0)}</span>
            <span className="text-tx-muted text-xs mb-0.5">g</span>
          </div>
          <div className="progress-track mt-2">
            <div className="progress-bar" style={{ width: `${proteinPct}%`, background: '#f59e0b' }} />
          </div>
        </div>

        {/* Workouts */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">This Week</span>
            <Dumbbell className="w-3.5 h-3.5 text-tx-muted" />
          </div>
          <div className="flex items-end gap-1">
            <span className="stat-value text-2xl">{stats.workouts.length}</span>
            <span className="text-tx-muted text-xs mb-0.5">sessions</span>
          </div>
        </div>
      </div>

      {/* ── Middle row ─────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Today's nutrition */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Today's Nutrition</h2>
            <button className="btn-ghost btn-sm">
              <Utensils className="w-3.5 h-3.5" /> Log
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-blue-500/10 border border-blue-500/30">
                <Beef className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-tx-secondary">Protein</span>
                  <span className="text-xs font-semibold text-tx-primary">
                    {Math.round(foodData?.total_protein || 0)}g / {settings.protein_target}g
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${proteinPct}%`, background: '#3b82f6' }} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-500/10 border border-amber-500/30">
                <Apple className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-tx-secondary">Carbs</span>
                  <span className="text-xs font-semibold text-tx-primary">
                    {Math.round(foodData?.total_carbs || 0)}g / {settings.carb_target}g
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${carbsPct}%`, background: '#f59e0b' }} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-purple-500/10 border border-purple-500/30">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-tx-secondary">Fat</span>
                  <span className="text-xs font-semibold text-tx-primary">
                    {Math.round(foodData?.total_fat || 0)}g / {settings.fat_target}g
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${fatPct}%`, background: '#8b5cf6' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Last workout */}
        {lastWorkout ? (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">{lastWorkout.name}</h2>
              <span className="badge-dim">{format(lastWorkout.started_at, 'MMM d')}</span>
            </div>

            <div className="space-y-0 divide-y divide-surface-border">
              {lastWorkout.exercises?.slice(0, 5).map((ex) => (
                <div key={ex.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-tx-muted flex-shrink-0" />
                    <span className="text-sm text-tx-secondary">{ex.exercise.name}</span>
                  </div>
                  <span className="text-xs text-tx-muted">
                    {ex.sets.length} sets
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-surface-border flex justify-between items-center">
              <span className="text-xs text-tx-muted">
                Duration: <span className="font-semibold">{lastWorkout.duration}s</span>
              </span>
              <a href="/workouts" className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400">
                Full log <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        ) : (
          <div className="card p-5 flex items-center justify-center min-h-48">
            <div className="text-center">
              <Dumbbell className="w-8 h-8 text-tx-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm text-tx-muted">No workouts logged yet</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
