import { useState } from 'react'
import { TrendingDown, TrendingUp, Plus, Calendar, Info } from 'lucide-react'
import { HelpTip } from '../components/Tooltip'

const PERIODS = ['7d', '30d', '90d', 'All'] as const
type Period = typeof PERIODS[number]

const MOCK_ENTRIES = [
  { date: 'Apr 18', value: 185.0 },
  { date: 'Apr 17', value: 185.2 },
  { date: 'Apr 16', value: 185.5 },
  { date: 'Apr 15', value: 186.0 },
  { date: 'Apr 14', value: 186.2 },
  { date: 'Apr 13', value: 186.5 },
  { date: 'Apr 12', value: 187.0 },
]

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

export default function Weight() {
  const [period, setPeriod] = useState<Period>('30d')
  const [newWeight, setNewWeight] = useState('')

  const values  = MOCK_ENTRIES.map(e => e.value)
  const current = values[0]
  const change  = +(current - values[values.length - 1]).toFixed(1)
  const average = +avg(values).toFixed(1)
  const min     = Math.min(...values)
  const max     = Math.max(...values)

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
              <span className="stat-value text-5xl">{current}</span>
              <span className="text-tx-muted text-lg mb-1">lbs</span>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg ${
            change < 0
              ? 'bg-success-500/10 border border-success-500/20 text-success-400'
              : 'bg-error-500/10 border border-error-500/20 text-error-400'
          }`}>
            {change < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {Math.abs(change)} lbs
          </div>
        </div>
        <p className="text-xs text-tx-muted mt-3">
          {Math.abs(change)} lbs {change < 0 ? 'lost' : 'gained'} over {period}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Average',  value: average, tip: 'Rolling average weight for selected period' },
          { label: 'Lowest',   value: min,     tip: 'Lowest recorded weight in selected period' },
          { label: 'Highest',  value: max,     tip: 'Highest recorded weight in selected period' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
              <HelpTip content={s.tip} />
            </div>
            <span className="stat-value text-xl">{s.value}</span>
            <span className="text-xs text-tx-muted ml-1">lbs</span>
          </div>
        ))}
      </div>

      {/* Chart placeholder + period selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5">
            <h2 className="section-title">Trend</h2>
            <HelpTip content="Smoothed rolling average — individual daily fluctuations are normal" />
          </div>
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

        {/* Mini chart — visual weight trend using div bars */}
        <div className="flex items-end gap-1 h-24 mb-1">
          {MOCK_ENTRIES.slice().reverse().map((entry, i) => {
            const pct = ((entry.value - min) / (max - min || 1)) * 100
            const height = 20 + pct * 0.8
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-brand-500/20 border border-brand-500/30 rounded-sm transition-all group-hover:bg-brand-500/40"
                  style={{ height: `${height}%` }}
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-overlay border border-surface-border rounded px-1.5 py-0.5 text-xs text-tx-primary whitespace-nowrap z-10">
                  {entry.value} lbs
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-tx-muted mt-1">
          <span>{MOCK_ENTRIES[MOCK_ENTRIES.length - 1].date}</span>
          <span>{MOCK_ENTRIES[0].date}</span>
        </div>
      </div>

      {/* Log weight */}
      <div className="card p-5">
        <div className="section-header">
          <h2 className="section-title">Log Today's Weight</h2>
        </div>
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
          <button className="btn-primary btn-md" disabled={!newWeight}>
            <Plus className="w-4 h-4" /> Log
          </button>
        </div>
        <p className="input-help flex items-center gap-1 mt-2">
          <Info className="w-3 h-3" />
          Best logged first thing in the morning, after using the bathroom
        </p>
      </div>

      {/* Log entries */}
      <div className="card p-5">
        <h2 className="section-title mb-4">History</h2>
        <div className="space-y-0 divide-y divide-surface-border">
          {MOCK_ENTRIES.map((entry, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <span className="text-sm text-tx-secondary">{entry.date}</span>
              <div className="flex items-center gap-3">
                {i < MOCK_ENTRIES.length - 1 && (
                  <span className={`text-xs font-medium ${
                    entry.value < MOCK_ENTRIES[i + 1].value ? 'text-success-400' : 'text-error-400'
                  }`}>
                    {entry.value < MOCK_ENTRIES[i + 1].value ? '↓' : '↑'}
                    {Math.abs(+(entry.value - MOCK_ENTRIES[i + 1].value).toFixed(1))}
                  </span>
                )}
                <span className="text-sm font-semibold text-tx-primary tabular-nums">
                  {entry.value} lbs
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
