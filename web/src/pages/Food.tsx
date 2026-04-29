import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { format, subDays, addDays } from 'date-fns'
import {
  ChevronLeft, ChevronRight, Flame, Plus, Trash2,
  AlertCircle, Coffee, Sun, Moon, Cookie, CalendarDays, Utensils,
} from 'lucide-react'
import IconButton from '../components/ui/IconButton'
import SectionHeader from '../components/ui/SectionHeader'
import SegmentedControl from '../components/ui/SegmentedControl'
import PageHeader from '../components/ui/PageHeader'
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import Loading from '../components/Loading'
import PeriodSelector from '../components/PeriodSelector'
import { foodAPI, userAPI } from '../services/api'
import { todayStr } from '../utils/dateUtils'
import * as types from '../types'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
}
const MEAL_ICONS: Record<string, React.ElementType> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snacks: Cookie,
}
const MEAL_COLORS: Record<string, string> = {
  breakfast: 'text-amber-400', lunch: 'text-yellow-400',
  dinner: 'text-indigo-400', snacks: 'text-pink-400',
}
const HISTORY_PERIODS = ['7d', '30d', '90d'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]

// ─── MacroRing ────────────────────────────────────────────────────────────────

function MacroRing({
  value, target, color, label,
}: { value: number; target: number; color: string; label: string }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / Math.max(target, 1))
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg width="72" height="72" className="-rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5"
            className="text-surface-muted" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold tabular-nums" style={{ color }}>{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tabular-nums text-tx-primary">{Math.round(value)}g</p>
        <p className="text-[10px] text-tx-muted">{label} / {target}g</p>
      </div>
    </div>
  )
}

// ─── Food page ────────────────────────────────────────────────────────────────

export default function Food() {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [logs, setLogs] = useState<types.FoodLog[]>([])
  const [stats, setStats] = useState<types.DailyStats | null>(null)
  const [settings, setSettings] = useState<types.UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<'today' | 'history'>('today')
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d')
  const [historyData, setHistoryData] = useState<types.FoodHistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const defaultStats: types.DailyStats = {
        date, total_calories: 0, total_protein: 0, total_carbs: 0,
        total_fat: 0, total_fiber: 0, workout_count: 0,
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

  useEffect(() => { loadDay(selectedDate) }, [selectedDate, location.key])

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
    navigate(`/food/log?meal=${meal}&date=${selectedDate}`)
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
  const calPct = Math.min(100, (totalCals / calTarget) * 100)

  const isToday = selectedDate === todayStr()
  const selectedDateObj = new Date(selectedDate + 'T12:00:00')
  const prevDate = format(subDays(selectedDateObj, 1), 'yyyy-MM-dd')
  const nextDate = format(addDays(selectedDateObj, 1), 'yyyy-MM-dd')
  const canGoNext = selectedDate < todayStr()

  const dayLabel = isToday
    ? 'Today'
    : selectedDate === format(subDays(new Date(), 1), 'yyyy-MM-dd')
      ? 'Yesterday'
      : format(selectedDateObj, 'EEE, MMM d')

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHeader
        title="Nutrition"
        subtitle="Macros & meals"
        action={
          <button onClick={() => openLog('breakfast')} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Log Food
          </button>
        }
      />

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedDate(prevDate)}
          className="p-3 rounded-xl hover:bg-surface-muted active:scale-95 transition-all text-tx-muted"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-surface-muted">
          <CalendarDays className="w-4 h-4 text-tx-muted" />
          <span className="text-sm font-semibold text-tx-primary">{dayLabel}</span>
          {!isToday && (
            <span className="text-xs text-tx-muted">{format(selectedDateObj, 'yyyy')}</span>
          )}
        </div>
        <button
          onClick={() => setSelectedDate(nextDate)}
          disabled={!canGoNext}
          className="p-3 rounded-xl hover:bg-surface-muted active:scale-95 transition-all text-tx-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Macro summary card */}
      {settings && (
        <div className="card p-5 space-y-5">
          {/* Calorie hero */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-tx-muted uppercase tracking-wide mb-1">Calories</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tabular-nums text-tx-primary">{Math.round(totalCals)}</span>
                <span className="text-sm text-tx-muted">/ {calTarget}</span>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border ${
              isOver
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              <Flame className="w-4 h-4" />
              {isOver
                ? `${Math.round(Math.abs(remaining))} over`
                : `${Math.round(remaining)} left`
              }
            </div>
          </div>

          {/* Segmented progress bar */}
          <div className="space-y-1">
            <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${calPct}%`,
                  background: isOver
                    ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                    : 'linear-gradient(90deg, #00b8d9, #10b981)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-tx-muted">
              <span>0</span>
              <span>{calTarget} kcal goal</span>
            </div>
          </div>

          {/* Macro rings */}
          <div className="grid grid-cols-3 gap-3">
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
      <SegmentedControl
        options={[
          { value: 'today', label: isToday ? 'Today' : format(selectedDateObj, 'MMM d') },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Today tab */}
      {tab === 'today' && (
        <div className="space-y-3">
          {MEALS.map(meal => {
            const MealIcon = MEAL_ICONS[meal]
            const iconColor = MEAL_COLORS[meal]
            const entries = logs.filter(l => l.meal === meal)
            const mealCals = entries.reduce((sum, e) => sum + e.calories, 0)

            return (
              <div key={meal} className="card overflow-hidden">
                {/* Meal header */}
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-surface-muted flex-shrink-0`}>
                    <MealIcon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-tx-primary">{MEAL_LABELS[meal]}</span>
                    {mealCals > 0 && (
                      <span className="ml-2 text-xs text-tx-muted tabular-nums">{Math.round(mealCals)} kcal</span>
                    )}
                  </div>
                  <IconButton
                    icon={Plus}
                    variant="solid"
                    label={`Add to ${MEAL_LABELS[meal]}`}
                    onClick={() => openLog(meal)}
                  />
                </div>

                {entries.length === 0 ? (
                  <button
                    onClick={() => openLog(meal)}
                    className="w-full px-4 py-4 text-center border-t border-surface-border hover:bg-surface-muted/50 transition-colors group"
                  >
                    <p className="text-xs text-tx-muted group-hover:text-tx-secondary transition-colors">
                      + Tap to add food
                    </p>
                  </button>
                ) : (
                  <div className="divide-y divide-surface-border border-t border-surface-border">
                    {entries.map(entry => (
                      <div key={entry.id}>
                        {deleteConfirmId === entry.id ? (
                          <div className="px-4 py-3 flex items-center justify-between gap-3 bg-error-500/5 border-l-2 border-error-500">
                            <p className="text-xs text-tx-secondary flex-1 min-w-0">
                              Delete <span className="font-medium text-tx-primary">{entry.name}</span>?
                            </p>
                            <div className="flex gap-2 flex-shrink-0">
                              <button onClick={() => setDeleteConfirmId(null)} className="btn-secondary btn-sm">
                                Cancel
                              </button>
                              <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} className="btn-danger-solid btn-sm disabled:opacity-50">
                                {deletingId === entry.id ? '…' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-4 py-3">
                            <button
                              onClick={() => navigate(`/food/log?edit=${entry.id}&date=${selectedDate}`)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              {entry.image_url ? (
                                <img src={entry.image_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-surface-border" />
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
                                  <Utensils className="w-5 h-5 text-tx-muted opacity-40" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-tx-primary truncate">{entry.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs font-semibold text-tx-secondary tabular-nums">
                                    {Math.round(entry.calories)} kcal
                                  </span>
                                  <span className="text-[10px] text-tx-muted">·</span>
                                  <span className="text-xs text-emerald-400 tabular-nums">{entry.protein.toFixed(0)}g P</span>
                                  <span className="text-[10px] text-tx-muted">·</span>
                                  <span className="text-xs text-amber-400 tabular-nums">{entry.carbs.toFixed(0)}g C</span>
                                  <span className="text-[10px] text-tx-muted">·</span>
                                  <span className="text-xs text-violet-400 tabular-nums">{entry.fat.toFixed(0)}g F</span>
                                  {entry.servings !== 1 && (
                                    <span className="text-xs text-tx-muted">× {entry.servings}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
                            </button>
                            <IconButton icon={Trash2} variant="danger" label="Delete" onClick={() => setDeleteConfirmId(entry.id)} />
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
          <SectionHeader
            title="Macro History"
            right={<PeriodSelector options={HISTORY_PERIODS} value={historyPeriod} onChange={setHistoryPeriod} />}
            className="mb-5"
          />

          {historyLoading ? (
            <div className="flex items-center justify-center h-48 text-xs text-tx-muted">Loading…</div>
          ) : historyData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <CalendarDays className="w-8 h-8 text-tx-muted opacity-40" />
              <p className="text-xs text-tx-muted">No data yet — start logging meals</p>
            </div>
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

          <div className="flex gap-4 justify-center mt-4">
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

    </div>
  )
}
