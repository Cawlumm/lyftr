import { useState, useEffect } from 'react'
import { Plus, Flame, AlertCircle, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { HelpTip } from '../components/Tooltip'
import Loading from '../components/Loading'
import { foodAPI, userAPI } from '../services/api'
import * as types from '../types'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_LABELS: Record<typeof MEALS[number], string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks'
}

export default function Food() {
  const [logs, setLogs] = useState<types.FoodLog[]>([])
  const [stats, setStats] = useState<types.DailyStats | null>(null)
  const [settings, setSettings] = useState<types.UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const today = format(new Date(), 'yyyy-MM-dd')
        const [logData, statsData, settingsData] = await Promise.all([
          foodAPI.list(today),
          foodAPI.stats(today).catch(() => ({
            date: today,
            total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, workout_count: 0
          })),
          userAPI.getSettings().catch(() => ({
            user_id: 0, weight_unit: 'lbs' as const, calorie_target: 2000,
            protein_target: 150, carb_target: 250, fat_target: 65
          })),
        ])
        setLogs(logData || [])
        setStats(statsData)
        setSettings(settingsData)
      } catch (err: any) {
        setError(err.message || 'Failed to load food data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleDelete = async (id: number) => {
    try {
      await foodAPI.delete(id)
      setLogs(logs.filter(l => l.id !== id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete entry')
    }
  }

  if (loading) {
    return <Loading />
  }

  if (!settings) {
    return (
      <div className="alert-error">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>Failed to load settings</span>
      </div>
    )
  }

  const stats_ = stats!
  const totalCals = stats_.total_calories
  const remaining = settings.calorie_target - totalCals

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Nutrition</h1>
          <p className="text-tx-muted text-sm mt-0.5">Log meals and track your macros</p>
        </div>
        <button className="btn-primary btn-sm">
          <Plus className="w-3.5 h-3.5" /> Log
        </button>
      </div>

      {/* Daily summary */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title">Today's Summary</h2>
          <div className={`flex items-center gap-1 text-xs font-medium ${remaining > 0 ? 'text-tx-muted' : 'text-warning-400'}`}>
            <Flame className="w-3.5 h-3.5" />
            {remaining > 0 ? `${remaining.toFixed(0)} kcal left` : `${Math.abs(remaining).toFixed(0)} kcal over`}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-tx-secondary">Calories</span>
            <span className="stat-value text-2xl">{Math.round(totalCals)} / {settings.calorie_target}</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${Math.min(100, (totalCals / settings.calorie_target) * 100)}%`, background: '#00b8d9' }} />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 pt-3 border-t border-surface-border">
            <div>
              <p className="text-xs text-tx-muted">Protein</p>
              <p className="stat-value text-lg">{Math.round(stats_.total_protein)}/{settings.protein_target}g</p>
            </div>
            <div>
              <p className="text-xs text-tx-muted">Carbs</p>
              <p className="stat-value text-lg">{Math.round(stats_.total_carbs)}/{settings.carb_target}g</p>
            </div>
            <div>
              <p className="text-xs text-tx-muted">Fat</p>
              <p className="stat-value text-lg">{Math.round(stats_.total_fat)}/{settings.fat_target}g</p>
            </div>
          </div>
        </div>
      </div>

      {/* Meal sections */}
      {MEALS.map(meal => {
        const entries = logs.filter(l => l.meal === meal)
        const mealCals = entries.reduce((sum, e) => sum + e.calories, 0)

        return (
          <div key={meal} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-tx-primary">{MEAL_LABELS[meal]}</span>
                {mealCals > 0 && <span className="badge-dim">{Math.round(mealCals)} kcal</span>}
              </div>
              <button className="btn-ghost btn-icon-sm">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {entries.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-tx-muted">No entries</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {entries.map(entry => (
                  <div key={entry.id} className="px-4 py-3 flex justify-between items-center hover:bg-surface-muted transition-colors group">
                    <div>
                      <p className="text-sm font-medium text-tx-primary">{entry.name}</p>
                      <p className="text-xs text-tx-muted">{Math.round(entry.calories)} kcal · {entry.servings} servings</p>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="btn-ghost btn-icon-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
