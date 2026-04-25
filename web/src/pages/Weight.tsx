import { useState, useEffect, useMemo, useRef } from 'react'
import { TrendingDown, TrendingUp, Minus, Plus, Calendar, Info, AlertCircle, Trash2, Pencil } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { HelpTip } from '../components/Tooltip'
import EditWeightModal from '../components/EditWeightModal'
import Loading from '../components/Loading'
import WeightInput from '../components/WeightInput'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort } from '../stores/settings'
import * as types from '../types'

const PERIODS = ['7d', '30d', '90d', 'All'] as const
type Period = typeof PERIODS[number]

const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, 'All': null }

const todayStr = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Simple n-point trailing moving average. Returns null where the window can't fill.
const movingAverage = (values: number[], window: number): (number | null)[] => {
  return values.map((_, i) => {
    if (i + 1 < window) return null
    const slice = values.slice(i + 1 - window, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

interface ChartPoint {
  ts: number
  weight: number
  date: Date
}

function TrendChart({ points, wUnit, showMA }: { points: ChartPoint[]; wUnit: string; showMA: boolean }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const W = 600
  const H = 180
  const PAD = { l: 8, r: 8, t: 16, b: 22 }

  const layout = useMemo(() => {
    if (points.length === 0) return null
    const xs = points.map(p => p.ts)
    const ys = points.map(p => p.weight)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    const yPad = (yMax - yMin) * 0.15 || 1
    const yLo = yMin - yPad
    const yHi = yMax + yPad
    const xRange = xMax - xMin || 1

    const xAt = (ts: number) =>
      points.length === 1 ? W / 2 : PAD.l + ((ts - xMin) / xRange) * (W - PAD.l - PAD.r)
    const yAt = (v: number) =>
      H - PAD.b - ((v - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b)

    const ma = showMA && points.length >= 7 ? movingAverage(ys, 7) : null
    return { xAt, yAt, xMin, xMax, yLo, yHi, ma }
  }, [points, showMA])

  if (!layout) return null

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${layout.xAt(p.ts).toFixed(1)},${layout.yAt(p.weight).toFixed(1)}`)
    .join(' ')

  const areaPath = `${linePath} L${layout.xAt(points[points.length - 1].ts).toFixed(1)},${H - PAD.b} L${layout.xAt(points[0].ts).toFixed(1)},${H - PAD.b} Z`

  const maPath = layout.ma
    ? layout.ma
        .map((v, i) => v == null ? null : `${layout.xAt(points[i].ts).toFixed(1)},${layout.yAt(v).toFixed(1)}`)
        .filter((s): s is string => s !== null)
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${s}`)
        .join(' ')
    : null

  const hover = hoverIdx != null ? points[hoverIdx] : null

  return (
    <div
      className="relative w-full"
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44 overflow-visible">
        <path d={areaPath} fill="#6366f1" fillOpacity={0.08} />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        {maPath && (
          <path d={maPath} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={layout.xAt(p.ts)}
            cy={layout.yAt(p.weight)}
            r={hoverIdx === i ? 4 : 2}
            fill="#6366f1"
          />
        ))}
        {/* Invisible hover targets for each point */}
        {points.map((p, i) => {
          const xPrev = i === 0 ? layout.xAt(p.ts) - 20 : (layout.xAt(points[i - 1].ts) + layout.xAt(p.ts)) / 2
          const xNext = i === points.length - 1 ? layout.xAt(p.ts) + 20 : (layout.xAt(p.ts) + layout.xAt(points[i + 1].ts)) / 2
          return (
            <rect
              key={`hit-${i}`}
              x={xPrev}
              y={0}
              width={Math.max(1, xNext - xPrev)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onTouchStart={() => setHoverIdx(i)}
            />
          )
        })}
      </svg>
      {/* Axis labels */}
      <div className="flex justify-between text-xs text-tx-muted -mt-3 px-2">
        <span>{format(points[0].date, 'MMM d')}</span>
        {points.length > 1 && <span>{format(points[points.length - 1].date, 'MMM d')}</span>}
      </div>
      {/* Tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 bg-surface-overlay border border-surface-border rounded px-2 py-1 text-xs text-tx-primary whitespace-nowrap z-10 shadow-card"
          style={{
            left: `${(layout.xAt(hover.ts) / W) * 100}%`,
            top: 0,
          }}
        >
          <div className="font-semibold tabular-nums">{hover.weight.toFixed(1)} {wUnit}</div>
          <div className="text-tx-muted">{format(hover.date, 'MMM d, yyyy')}</div>
        </div>
      )}
    </div>
  )
}

export default function Weight() {
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [period, setPeriod] = useState<Period>('30d')
  const [showMA, setShowMA] = useState(true)
  const [logs, setLogs] = useState<types.WeightLog[]>([])
  const [stats, setStats] = useState<types.WeightStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Log form
  const [newWeight, setNewWeight] = useState('')
  const [newDate, setNewDate] = useState(todayStr())
  const [newNotes, setNewNotes] = useState('')
  const [logging, setLogging] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  // Edit/delete
  const [editing, setEditing] = useState<types.WeightLog | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const prefillDoneRef = useRef(false)

  const refresh = async () => {
    const [logData, statsData] = await Promise.all([
      weightAPI.list({ limit: 365 }),
      weightAPI.stats(),
    ])
    setLogs(logData || [])
    setStats(statsData)
    if (!prefillDoneRef.current && logData && logData.length > 0) {
      setNewWeight(String(logData[0].weight))
      prefillDoneRef.current = true
    }
  }

  useEffect(() => {
    refresh()
      .catch(err => setError(err?.message || 'Failed to load weight data'))
      .finally(() => setLoading(false))
  }, [])

  const days = PERIOD_DAYS[period]
  const filtered = useMemo(() => {
    if (days == null) return logs
    const cutoff = subDays(new Date(), days).getTime()
    return logs.filter(l => new Date(l.logged_at).getTime() >= cutoff)
  }, [logs, days])

  // Oldest → newest for the chart
  const chartPoints: ChartPoint[] = useMemo(() => {
    return filtered
      .slice()
      .reverse()
      .map(l => {
        const d = new Date(l.logged_at)
        return { ts: d.getTime(), weight: l.weight, date: d }
      })
  }, [filtered])

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(newWeight)
    if (!Number.isFinite(w) || w <= 0) {
      setError('Enter a valid weight')
      return
    }
    setLogging(true)
    setError(null)

    const tempId = -Date.now()
    const loggedAtIso = new Date(`${newDate}T12:00:00`).toISOString()
    const trimmedNotes = newNotes.trim()
    const optimistic: types.WeightLog = {
      id: tempId,
      weight: w,
      notes: trimmedNotes,
      logged_at: loggedAtIso,
    }
    setLogs(prev =>
      [optimistic, ...prev].sort(
        (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      )
    )

    try {
      const real = await weightAPI.log({
        weight: w,
        notes: trimmedNotes,
        logged_at: loggedAtIso,
      })
      setLogs(prev => prev.map(l => (l.id === tempId ? real : l)))
      // Re-prefill with the just-logged value so the next entry starts from there
      setNewWeight(String(real.weight))
      setNewNotes('')
      setNewDate(todayStr())
      setShowNotes(false)
      weightAPI.stats().then(setStats).catch(() => {})
    } catch (err: any) {
      setLogs(prev => prev.filter(l => l.id !== tempId))
      setError(err?.response?.data?.error || 'Failed to log weight')
    } finally {
      setLogging(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await weightAPI.delete(id)
      setConfirmDeleteId(null)
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <Loading />

  if (error && logs.length === 0) {
    return (
      <div className="alert-error">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  // Period change is computed from filtered window so the hero card matches the selector.
  const periodValues = filtered.map(l => l.weight)
  const current = periodValues[0] ?? stats?.latest ?? 0
  const oldest = periodValues[periodValues.length - 1] ?? stats?.starting ?? 0
  const change = +(current - oldest).toFixed(1)
  const avg = periodValues.length > 0 ? +(periodValues.reduce((a, b) => a + b, 0) / periodValues.length).toFixed(1) : 0
  const min = periodValues.length > 0 ? Math.min(...periodValues) : 0
  const max = periodValues.length > 0 ? Math.max(...periodValues) : 0

  const trendIcon = change === 0 ? Minus : change < 0 ? TrendingDown : TrendingUp
  const TrendIcon = trendIcon
  const trendClass =
    change === 0
      ? 'bg-surface-muted border-surface-border text-tx-muted'
      : change < 0
        ? 'bg-success-500/10 border-success-500/20 text-success-400'
        : 'bg-error-500/10 border-error-500/20 text-error-400'
  const changeWord = change === 0 ? 'no change' : change < 0 ? 'lost' : 'gained'

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Weight</h1>
          <p className="text-tx-muted text-sm mt-0.5">Track your body weight over time</p>
        </div>
        <span className="badge-brand">
          <Calendar className="w-3 h-3" /> {wUnit}
        </span>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick log — at top of page so entry is reachable on first paint */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Log Weight</h2>
          {logs.length > 0 && (
            <span className="text-[11px] text-tx-muted">last: {logs[0].weight.toFixed(1)} {wUnit}</span>
          )}
        </div>
        <form onSubmit={handleLog} className="space-y-3">
          <WeightInput
            value={newWeight}
            onChange={setNewWeight}
            unit={wUnit}
            size="lg"
          />

          {showNotes ? (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                max={todayStr()}
                className="input"
              />
              <input
                type="text"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Note (optional)"
                maxLength={200}
                className="input"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              + Change date or add a note
            </button>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="input-help flex items-center gap-1 mb-0">
              <Info className="w-3 h-3" />
              Best logged in the morning, after the bathroom
            </p>
            <button
              type="submit"
              disabled={!newWeight || logging}
              className="btn-primary btn-md flex-shrink-0"
            >
              <Plus className="w-4 h-4" /> {logging ? 'Logging…' : 'Log'}
            </button>
          </div>
        </form>
      </div>

      {/* Current weight hero */}
      <div className="card p-6 border-brand-500/20 bg-brand-500/5">
        {logs.length === 0 ? (
          <div className="text-center py-2">
            <p className="stat-label mb-1">Current Weight</p>
            <p className="text-tx-muted text-sm">No logs yet — use the form above to log your first weight</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="stat-label mb-2">Current Weight</p>
                <div className="flex items-end gap-2">
                  <span className="stat-value text-5xl">{current.toFixed(1)}</span>
                  <span className="text-tx-muted text-lg mb-1">{wUnit}</span>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border ${trendClass}`}>
                <TrendIcon className="w-4 h-4" />
                {Math.abs(change).toFixed(1)} {wUnit}
              </div>
            </div>
            <p className="text-xs text-tx-muted mt-3">
              {Math.abs(change).toFixed(1)} {wUnit} {changeWord} over {period}
            </p>
          </>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Average', value: avg, tip: 'Average weight for selected period' },
          { label: 'Lowest', value: min, tip: 'Lowest recorded weight in period' },
          { label: 'Highest', value: max, tip: 'Highest recorded weight in period' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
              <HelpTip content={s.tip} />
            </div>
            <span className="stat-value text-xl">{s.value.toFixed(1)}</span>
            <span className="text-xs text-tx-muted ml-1">{wUnit}</span>
          </div>
        ))}
      </div>

      {/* Chart + period selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="section-title">Trend</h2>
          <div className="flex items-center gap-2">
            {chartPoints.length >= 7 && (
              <button
                onClick={() => setShowMA(v => !v)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  showMA
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                    : 'bg-surface-overlay border-surface-border text-tx-muted hover:text-tx-primary'
                }`}
                title="7-day moving average"
              >
                7d avg
              </button>
            )}
            <div className="flex gap-1 bg-surface-overlay rounded-lg p-1">
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                    period === p
                      ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
                      : 'text-tx-muted hover:text-tx-primary'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartPoints.length === 0 ? (
          <div className="flex items-center justify-center h-44 text-tx-muted text-sm">
            No data for this period
          </div>
        ) : chartPoints.length === 1 ? (
          <div className="flex items-center justify-center h-44 text-tx-muted text-sm">
            Log another entry to see the trend
          </div>
        ) : (
          <TrendChart points={chartPoints} wUnit={wUnit} showMA={showMA} />
        )}
      </div>

      {/* History */}
      {logs.length > 0 && (
        <div className="card p-5">
          <h2 className="section-title mb-4">History</h2>
          <div className="divide-y divide-surface-border">
            {logs.slice(0, 30).map((entry, i) => {
              const next = logs[i + 1]
              const delta = next ? entry.weight - next.weight : 0
              if (confirmDeleteId === entry.id) {
                return (
                  <div key={entry.id} className="flex items-center justify-between py-3 gap-2">
                    <span className="text-sm text-tx-secondary truncate">
                      Delete {format(new Date(entry.logged_at), 'MMM d')} entry?
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting}
                        className="px-3 py-1.5 text-xs bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={entry.id} className="flex items-center justify-between py-3 group">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-tx-secondary">
                      {format(new Date(entry.logged_at), 'MMM d, yyyy')}
                    </span>
                    {entry.notes && (
                      <span className="text-xs text-tx-muted truncate">{entry.notes}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {delta !== 0 && (
                      <span className={`text-xs font-medium tabular-nums ${delta < 0 ? 'text-success-400' : 'text-error-400'}`}>
                        {delta < 0 ? '↓' : '↑'}{Math.abs(delta).toFixed(1)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-tx-primary tabular-nums">
                      {entry.weight.toFixed(1)} {wUnit}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(entry)}
                        className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors"
                        aria-label="Edit entry"
                      >
                        <Pencil className="w-3.5 h-3.5 text-tx-muted" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="p-1.5 hover:bg-error-500/10 rounded-lg transition-colors"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-tx-muted hover:text-error-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <EditWeightModal
        isOpen={editing !== null}
        log={editing}
        onClose={() => setEditing(null)}
        onSuccess={refresh}
      />
    </div>
  )
}
