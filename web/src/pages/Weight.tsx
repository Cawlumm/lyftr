import { useState, useEffect } from 'react'
import { TrendingDown, TrendingUp, Plus, Calendar, Info, AlertCircle } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { HelpTip } from '../components/Tooltip'
import Loading from '../components/Loading'
import { weightAPI } from '../services/api'
import * as types from '../types'

const PERIODS = ['7d', '30d', '90d', 'All'] as const
type Period = typeof PERIODS[number]

const getPeriodDays = (p: Period) => {
  const map: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, 'All': 999 }
  return map[p]
}

export default function Weight() {
  const [period, setPeriod] = useState<Period>('30d')
  const [newWeight, setNewWeight] = useState('')
  const [logs, setLogs] = useState<types.WeightLog[]>([])
  const [stats, setStats] = useState<types.WeightStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [logData, statsData] = await Promise.all([
          weightAPI.list({ limit: 100 }),
          weightAPI.stats(),
        ])
        setLogs(logData || [])
        setStats(statsData)
      } catch (err: any) {
        setError(err.message || 'Failed to load weight data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const daysToShow = getPeriodDays(period)
  const filtered = logs.filter(l => {
    const logDate = new Date(l.logged_at)
    const daysDiff = Math.floor((Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24))
    return daysDiff <= daysToShow
  })

  const handleLog = async () => {
    if (!newWeight) return
    setLogging(true)
    try {
      await weightAPI.log({ weight: parseFloat(newWeight) })
      setNewWeight('')
      const [logData, statsData] = await Promise.all([
        weightAPI.list({ limit: 100 }),
        weightAPI.stats(),
      ])
      setLogs(logData || [])
      setStats(statsData)
    } catch (err: any) {
      setError(err.message || 'Failed to log weight')
    } finally {
      setLogging(false)
    }
  }

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

  const values = filtered.map(l => l.weight)
  const current = values[0] || stats?.latest || 0
  const oldest = values[values.length - 1] || stats?.starting || 0
  const change = +(current - oldest).toFixed(1)
  const avg = values.length > 0 ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 0

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Weight</h1>
          <p className="text-tx-muted text-sm mt-0.5">Track your body weight over time</p>
        </div>
        <span className="badge-brand">
          <Calendar className="w-3 h-3" /> lbs
        </span>
      </div>

      {/* Current weight hero */}
      <div className="card p-6 border-brand-500/20 bg-brand-500/5">
        <div className="flex items-start justify-between">
          <div>
            <p className="stat-label mb-2">Current Weight</p>
            <div className="flex items-end gap-2">
              <span className="stat-value text-5xl">{current.toFixed(1)}</span>
              <span className="text-tx-muted text-lg mb-1">lbs</span>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg ${
            change < 0
              ? 'bg-success-500/10 border border-success-500/20 text-success-400'
              : 'bg-error-500/10 border border-error-500/20 text-error-400'
          }`}>
            {change < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {Math.abs(change).toFixed(1)} lbs
          </div>
        </div>
        <p className="text-xs text-tx-muted mt-3">
          {Math.abs(change).toFixed(1)} lbs {change < 0 ? 'lost' : 'gained'} over {period}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Average', value: avg, tip: 'Average weight for selected period' },
          { label: 'Lowest', value: min, tip: 'Lowest recorded weight' },
          { label: 'Highest', value: max, tip: 'Highest recorded weight' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
              <HelpTip content={s.tip} />
            </div>
            <span className="stat-value text-xl">{s.value.toFixed(1)}</span>
            <span className="text-xs text-tx-muted ml-1">lbs</span>
          </div>
        ))}
      </div>

      {/* Chart + period selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title">Trend</h2>
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

        {/* Mini chart */}
        <div className="flex items-end gap-1 h-24 mb-1">
          {filtered.slice().reverse().map((entry, i) => {
            const pct = max > min ? ((entry.weight - min) / (max - min)) * 100 : 50
            const height = 20 + pct * 0.8
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-brand-500/20 border border-brand-500/30 rounded-sm transition-all group-hover:bg-brand-500/40"
                  style={{ height: `${height}%` }}
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-overlay border border-surface-border rounded px-1.5 py-0.5 text-xs text-tx-primary whitespace-nowrap z-10">
                  {entry.weight.toFixed(1)} lbs
                </div>
              </div>
            )
          })}
        </div>
        {filtered.length > 0 && (
          <div className="flex justify-between text-xs text-tx-muted mt-1">
            <span>{format(new Date(filtered[filtered.length - 1].logged_at), 'MMM d')}</span>
            <span>{format(new Date(filtered[0].logged_at), 'MMM d')}</span>
          </div>
        )}
      </div>

      {/* Log weight */}
      <div className="card p-5">
        <h2 className="section-title mb-3">Log Today's Weight</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={newWeight}
              onChange={e => setNewWeight(e.target.value)}
              placeholder="185.0"
              step="0.1"
              className="input pr-10"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-tx-muted">lbs</span>
          </div>
          <button
            onClick={handleLog}
            disabled={!newWeight || logging}
            className="btn-primary btn-md"
          >
            <Plus className="w-4 h-4" /> {logging ? 'Logging...' : 'Log'}
          </button>
        </div>
        <p className="input-help flex items-center gap-1 mt-2">
          <Info className="w-3 h-3" />
          Best logged first thing in the morning, after using the bathroom
        </p>
      </div>

      {/* History */}
      {logs.length > 0 && (
        <div className="card p-5">
          <h2 className="section-title mb-4">History</h2>
          <div className="space-y-0 divide-y divide-surface-border">
            {logs.slice(0, 20).map((entry, i) => {
              const next = logs[i + 1]
              const delta = next ? entry.weight - next.weight : 0
              return (
                <div key={entry.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-tx-secondary">{format(new Date(entry.logged_at), 'MMM d')}</span>
                  <div className="flex items-center gap-3">
                    {delta !== 0 && (
                      <span className={`text-xs font-medium ${delta < 0 ? 'text-success-400' : 'text-error-400'}`}>
                        {delta < 0 ? '↓' : '↑'}{Math.abs(delta).toFixed(1)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-tx-primary">{entry.weight.toFixed(1)} lbs</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
