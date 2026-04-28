import { useState, useEffect, useCallback } from 'react'
import { format, subDays, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Flame, Plus, Pencil, Trash2, AlertCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import Loading from '../components/Loading'
import PeriodSelector from '../components/PeriodSelector'
import FoodLogModal from '../components/FoodLogModal'
import { foodAPI, userAPI } from '../services/api'
import { todayStr } from '../utils/dateUtils'
import * as types from '../types'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
}
const HISTORY_PERIODS = ['7d', '30d', '90d'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]

// ─── MacroRing ────────────────────────────────────────────────────────────────

function MacroRing({
  value, target, color, label,
}: { value: number; target: number; color: string; label: string }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / Math.max(target, 1))
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4"
          className="text-surface-muted" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="stat-value text-sm tabular-nums">{Math.round(value)}g</span>
      <span className="text-[10px] text-tx-muted">{label}</span>
    </div>
  )
}

// ─── Food page ────────────────────────────────────────────────────────────────

export default function Food() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [logs, setLogs] = useState<types.FoodLog[]>([])
  const [stats, setStats] = useState<types.DailyStats | null>(null)
  const [settings, setSettings] = useState<types.UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tab state
  const [tab, setTab] = useState<'today' | 'history'>('today')
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d')
  const [historyData, setHistoryData] = useState<types.FoodHistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMeal, setModalMeal] = useState<types.FoodLog['meal']>('breakfast')
  const [editEntry, setEditEntry] = useState<types.FoodLog | undefined>(undefined)

  // Delete confirm state: id being deleted
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const defaultStats: types.DailyStats = {
        date,
        total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0,
        total_fiber: 0, workout_count: 0,
      }
      const [logData, statsData, settingsData] = await Promise.all([
        foodAPI.list(date),
        foodAPI.stats(date).catch(() => defaultStats),
        settings
          ? Promise.resolve(settings)
          : userAPI.getSettings().catch(() => ({
              user_id: 0, weight_unit: 'lbs' as const,
              calorie_target: 2000, protein_target: 150, carb_target: 250, fat_target: 65,
            })),
      ])
      setLogs(logData || [])
      setStats(statsData)
      if (!settings) setSettings(settingsData as types.UserSettings)
    } catch (err: any) {
      setError(err.message || 'Failed to load food data')
    } finally {
      setLoading(false)
    }
  }, [settings])

  useEffect(() => { loadDay(selectedDate) }, [selectedDate])

  useEffect(() => {
    if (tab !== 'history') return
    setHistoryLoading(true)
    const days = historyPeriod === '7d' ? 7 : historyPeriod === '30d' ? 30 : 90
    foodAPI.history(days)
      .then(data => setHistoryData(data || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [tab, historyPeriod])

  const openLog = (meal: types.FoodLog['meal']) => {
    setEditEntry(undefined)
    setModalMeal(meal)
    setModalOpen(true)
  }

  const openEdit = (entry: types.FoodLog) => {
    setEditEntry(entry)
    setModalOpen(true)
  }

  const handleLogged = (entry: types.FoodLog) => {
    if (editEntry) {
      setLogs(prev => prev.map(l => l.id === entry.id ? entry : l))
    } else {
      setLogs(prev => [...prev, entry])
    }
    foodAPI.stats(selectedDate).then(setStats).catch(() => {})
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await foodAPI.delete(id)
      setLogs(prev => prev.filter(l => l.id !== id))
      setDeleteConfirmId(null)
      foodAPI.stats(selectedDate).then(setStats).catch(() => {})
    } catch {
      setError('Failed to delete entry')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading && !logs.length) return <Loading />

  const s = stats
  const totalCals = s?.total_calories ?? 0
  const calTarget = settings?.calorie_target ?? 2000
  const remaining = calTarget - totalCals
  const isOver = remaining < 0

  const isToday = selectedDate === todayStr()

  const prevDate = format(subDays(new Date(selectedDate + 'T12:00:00'), 1), 'yyyy-MM-dd')
  const nextDate = format(addDays(new Date(selectedDate + 'T12:00:00'), 1), 'yyyy-MM-dd')
  const canGoNext = selectedDate < todayStr()

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Nutrition</h1>
          <p className="text-tx-muted text-sm mt-0.5">Track macros and meals</p>
        </div>
        <button
          onClick={() => openLog('breakfast')}
          className="btn-primary btn-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Log
        </button>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Date navigator */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setSelectedDate(prevDate)}
          className="p-2 rounded-lg hover:bg-surface-muted transition-colors text-tx-muted"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-tx-primary">
          {isToday ? 'Today' : format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}
        </span>
        <button
          onClick={() => setSelectedDate(nextDate)}
          disabled={!canGoNext}
          className="p-2 rounded-lg hover:bg-surface-muted transition-colors text-tx-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Macro summary card */}
      {settings && (
        <div className="card p-5">
          {/* Calorie hero */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="stat-label mb-0.5">Calories</p>
              <div className="flex items-end gap-1.5">
                <span className="stat-value text-4xl tabular-nums">{Math.round(totalCals)}</span>
                <span className="text-tx-muted text-sm mb-1">/ {calTarget} kcal</span>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
              isOver
                ? 'bg-warning-400/10 border-warning-400/20 text-warning-400'
                : 'bg-surface-muted border-surface-border text-tx-muted'
            }`}>
              <Flame className="w-3.5 h-3.5" />
              {isOver
                ? `${Math.round(Math.abs(remaining))} over`
                : `${Math.round(remaining)} left`
              }
            </div>
          </div>

          {/* Progress bar */}
          <div className="progress-track mb-5">
            <div
              className="progress-bar"
              style={{
                width: `${Math.min(100, (totalCals / calTarget) * 100)}%`,
                background: isOver ? '#f59e0b' : '#00b8d9',
              }}
            />
          </div>

          {/* Macro rings */}
          <div className="grid grid-cols-3 gap-2">
            <MacroRing
              value={s?.total_protein ?? 0}
              target={settings.protein_target}
              color="#10b981"
              label="Protein"
            />
            <MacroRing
              value={s?.total_carbs ?? 0}
              target={settings.carb_target}
              color="#f59e0b"
              label="Carbs"
            />
            <MacroRing
              value={s?.total_fat ?? 0}
              target={settings.fat_target}
              color="#8b5cf6"
              label="Fat"
            />
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-overlay rounded-lg p-1">
        {(['today', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 ${
              tab === t
                ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
                : 'text-tx-muted hover:text-tx-primary'
            }`}
          >
            {t === 'today' ? (isToday ? 'Today' : format(new Date(selectedDate + 'T12:00:00'), 'MMM d')) : 'History'}
          </button>
        ))}
      </div>

      {/* Today tab */}
      {tab === 'today' && (
        <div className="space-y-3">
          {MEALS.map(meal => {
            const entries = logs.filter(l => l.meal === meal)
            const mealCals = entries.reduce((sum, e) => sum + e.calories, 0)

            return (
              <div key={meal} className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-tx-primary">{MEAL_LABELS[meal]}</span>
                    {mealCals > 0 && (
                      <span className="badge-dim tabular-nums">{Math.round(mealCals)} kcal</span>
                    )}
                  </div>
                  <button
                    onClick={() => openLog(meal)}
                    className="btn-ghost btn-icon-sm"
                    aria-label={`Add to ${MEAL_LABELS[meal]}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {entries.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-tx-muted">No entries</p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-border">
                    {entries.map(entry => (
                      <div key={entry.id}>
                        {deleteConfirmId === entry.id ? (
                          <div className="px-4 py-3 flex items-center justify-between gap-3 bg-error-500/5 border-l-2 border-error-500">
                            <p className="text-xs text-tx-secondary flex-1 min-w-0">
                              Delete <span className="font-medium text-tx-primary">{entry.name}</span>?
                            </p>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-2.5 py-1 text-xs rounded-lg bg-surface-muted border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDelete(entry.id)}
                                disabled={deletingId === entry.id}
                                className="px-2.5 py-1 text-xs rounded-lg bg-error-500/20 border border-error-500/30 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50"
                              >
                                {deletingId === entry.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="px-4 py-3 flex items-center gap-2 hover:bg-surface-muted transition-colors group">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-tx-primary truncate">{entry.name}</p>
                              <p className="text-xs text-tx-muted tabular-nums">
                                {Math.round(entry.calories)} kcal
                                {' · '}{entry.protein.toFixed(0)}g P
                                {' · '}{entry.carbs.toFixed(0)}g C
                                {' · '}{entry.fat.toFixed(0)}g F
                                {entry.servings !== 1 && ` · ×${entry.servings}`}
                              </p>
                            </div>
                            <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                onClick={() => openEdit(entry)}
                                className="p-1.5 rounded-lg hover:bg-surface-overlay text-tx-muted hover:text-tx-primary transition-colors"
                                aria-label="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(entry.id)}
                                className="p-1.5 rounded-lg hover:bg-error-500/10 text-tx-muted hover:text-error-400 transition-colors"
                                aria-label="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="section-title">Macro History</h2>
            <PeriodSelector options={HISTORY_PERIODS} value={historyPeriod} onChange={setHistoryPeriod} />
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center h-48 text-xs text-tx-muted">Loading…</div>
          ) : historyData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-tx-muted">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={historyData} barSize={8} barGap={2} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(new Date(d + 'T12:00:00'), 'M/d')}
                  tick={{ fontSize: 10, fill: 'var(--color-tx-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: 'var(--color-tx-primary)',
                  }}
                  labelFormatter={d => format(new Date(d + 'T12:00:00'), 'MMM d')}
                  formatter={(val: number, name: string) => [`${Math.round(val)}g`, name]}
                  cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                />
                <Bar dataKey="protein" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="Protein" />
                <Bar dataKey="carbs" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} name="Carbs" />
                <Bar dataKey="fat" stackId="a" fill="#8b5cf6" radius={[2, 2, 0, 0]} name="Fat" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="flex gap-4 justify-center mt-3">
            {[
              { color: '#10b981', label: 'Protein' },
              { color: '#f59e0b', label: 'Carbs' },
              { color: '#8b5cf6', label: 'Fat' },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: m.color }} />
                <span className="text-xs text-tx-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FoodLogModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEntry(undefined) }}
        onLogged={handleLogged}
        defaultMeal={modalMeal}
        editEntry={editEntry}
        defaultDate={selectedDate}
      />
    </div>
  )
}
