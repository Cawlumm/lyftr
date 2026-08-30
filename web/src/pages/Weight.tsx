import { useState, useEffect, useMemo, useRef } from 'react'
import { TrendingDown, TrendingUp, Minus, Plus, Calendar, Sunrise, AlertCircle, ChevronRight, Scale, Activity, ArrowDown, ArrowUp, X } from 'lucide-react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { HelpTip } from '../components/Tooltip'
import Loading from '../components/Loading'
import PageHeader from '../components/ui/PageHeader'
import DateInput from '../components/ui/DateInput'
import PeriodSelector from '../components/PeriodSelector'
import StepperTile from '../components/ui/StepperTile'
import NumberField from '../components/ui/NumberField'
import { apiErrorMessage, useAsyncAction, BODYWEIGHT_STEP, clampStep, todayStr, daysAgoStr, dayToInstant, entryDay, dayToLocalDate, types, formatDay } from '@lyftr/shared'
import { useServerInfiniteList } from '../hooks/useServerInfiniteList'
import { ErrorState, ListError, StatFailure } from '../components/ui'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, lbsToDisplay, displayToLbs, displayWeight, round1 , weightError, maxWeight } from '../stores/settings'

const PERIODS = ['7d', '30d', '90d', 'All'] as const
type Period = typeof PERIODS[number]

const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, 'All': null }

interface ChartPoint {
  ts: number
  weight: number
  date: Date
}

const W = 400
const H = 200
const PL = 40, PR = 8, PT = 22, PB = 30

// Catmull-rom → cubic bezier for smooth organic curves
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2)
    return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function TrendChart({ points, wUnit }: { points: ChartPoint[]; wUnit: string }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const layout = useMemo(() => {
    if (points.length < 2) return null
    const ys = points.map(p => p.weight)
    const xs = points.map(p => p.ts)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const yPad = Math.max((yMax - yMin) * 0.22, 1)
    const yLo = yMin - yPad, yHi = yMax + yPad
    const xRange = xMax - xMin || 1

    const xAt = (ts: number) => PL + ((ts - xMin) / xRange) * (W - PL - PR)
    const yAt = (v: number) => PT + (1 - (v - yLo) / (yHi - yLo)) * (H - PT - PB)

    const wPts: [number, number][] = points.map(p => [xAt(p.ts), yAt(p.weight)])

    // 3 y-axis ticks evenly spaced in visible range
    const ticks = [0, 0.5, 1].map(f => ({
      label: Math.round(yLo + f * (yHi - yLo)).toString(),
      y: yAt(yLo + f * (yHi - yLo)),
    }))

    return { xAt, yAt, wPts, ticks }
  }, [points])

  if (!layout) return null

  const { wPts, ticks } = layout
  const linePath = smoothPath(wPts)
  const last = wPts[wPts.length - 1]
  const areaPath = `${linePath} L${last[0].toFixed(1)},${(H - PB).toFixed(1)} L${wPts[0][0].toFixed(1)},${(H - PB).toFixed(1)} Z`

  const activeXY = activeIdx != null ? wPts[activeIdx] : null
  const activePoint = activeIdx != null ? points[activeIdx] : null

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = PL + ((e.clientX - rect.left) / rect.width) * (W - PL - PR)
    let best = 0, bestDist = Infinity
    wPts.forEach(([px], i) => {
      const d = Math.abs(px - x)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setActiveIdx(best)
  }

  // Callout: flip left if dot near right edge, flip below if dot near top
  const calloutFlipH = last[0] > W * 0.65
  const calloutFlipV = last[1] < PT + 30
  const calloutLabel = String(round1(points[points.length - 1].weight))
  const calloutW = calloutLabel.length * 9 + 16
  const calloutX = calloutFlipH ? last[0] - calloutW - 8 : last[0] + 8
  const calloutY = calloutFlipV ? last[1] + 10 : last[1] - 28

  const tooltipLeft = activeXY ? (activeXY[0] / W) * 100 : 0
  const flipTooltip = activeXY ? activeXY[0] > W * 0.6 : false

  return (
    <div className="relative w-full select-none">
      {activePoint && activeXY && (
        <div
          className="absolute pointer-events-none z-10 top-0"
          style={{
            left: `${tooltipLeft}%`,
            transform: flipTooltip ? 'translateX(-100%) translateX(-8px)' : 'translateX(8px)',
          }}
        >
          <div className="bg-surface-raised border border-surface-border rounded-xl px-3 py-2 shadow-card text-xs whitespace-nowrap">
            <p className="font-bold tabular-nums text-tx-primary text-sm">
              {round1(activePoint.weight)} <span className="font-normal text-tx-muted">{wUnit}</span>
            </p>
            <p className="text-tx-muted mt-0.5">{format(activePoint.date, 'MMM d, yyyy')}</p>
          </div>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="70%" stopColor="#6366f1" stopOpacity={0.06} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Subtle grid lines */}
        {ticks.map(t => (
          <line key={t.label} x1={PL} y1={t.y} x2={W - PR} y2={t.y}
            stroke="#6366f1" strokeOpacity={0.08} strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Y-axis tick labels */}
        {ticks.map(t => (
          <text key={`y-${t.label}`} x={PL - 6} y={t.y + 5}
            fontSize={13} textAnchor="end" fill="var(--color-tx-muted)" fillOpacity={0.65}>
            {t.label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#wGrad)" />

        {/* Active vertical rule */}
        {activeXY && (
          <line x1={activeXY[0]} y1={PT - 4} x2={activeXY[0]} y2={H - PB}
            stroke="#6366f1" strokeOpacity={0.3} strokeWidth={1} />
        )}

        {/* Main bezier line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Persistent callout on latest point (hidden while interacting) */}
        {!activeXY && (
          <>
            <circle cx={last[0]} cy={last[1]} r={8} fill="#6366f1" fillOpacity={0.14} />
            <circle cx={last[0]} cy={last[1]} r={4} fill="#6366f1" />
            <rect x={calloutX} y={calloutY} width={calloutW} height={22} rx={6}
              fill="#6366f1" fillOpacity={0.18} />
            <text x={calloutX + calloutW / 2} y={calloutY + 15}
              fontSize={13} fontWeight="700" textAnchor="middle" fill="#818cf8">
              {calloutLabel}
            </text>
          </>
        )}

        {/* Active dot */}
        {activeXY && (
          <>
            <circle cx={activeXY[0]} cy={activeXY[1]} r={8} fill="#6366f1" fillOpacity={0.15} />
            <circle cx={activeXY[0]} cy={activeXY[1]} r={4} fill="#6366f1" />
          </>
        )}

        {/* Date range labels */}
        <text x={PL} y={H - 10} fontSize={12} fill="var(--color-tx-muted)" fillOpacity={0.6} textAnchor="start">
          {format(points[0].date, 'MMM d')}
        </text>
        <text x={W - PR} y={H - 10} fontSize={12} fill="var(--color-tx-muted)" fillOpacity={0.6} textAnchor="end">
          {format(points[points.length - 1].date, 'MMM d')}
        </text>

        {/* Hit area — only over chart region, not y-axis */}
        <rect
          x={PL} y={0} width={W - PL - PR} height={H - PB}
          fill="transparent"
          style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIdx(null)}
        />
      </svg>
    </div>
  )
}

export default function Weight() {
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [period, setPeriod] = useState<Period>('30d')
  const [stats, setStats] = useState<types.WeightStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Paginated history list
  const {
    items, sentinelRef, hasMore, loading: listLoading, initialLoading, reload,
    error: listError, retry: retryList,
  } = useServerInfiniteList<types.WeightLog>({
    fetcher: (offset, limit) => weightAPI.list({ offset, limit }),
  })

  // Chart data — re-fetched when period changes
  const [chartLogs, setChartLogs] = useState<types.WeightLog[]>([])

  // Both of these used to swallow their failure. Nothing recorded it, so the aggregates
  // below fell back to 0 and the page rendered three measurements it had never received.
  const [chartError, setChartError] = useState<string | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  // `cancelled` is not tidiness, it is correctness. A wider window is a slower query, so
  // tapping All and then 7d can land All's answer last — and the figures, the chart and
  // the "over 7d" line would then all be describing a period the user is not looking at.
  // Measured: 7d reads 182/181/183 and All reads 179/173/185, and without this the 7d
  // view showed All's numbers.
  useEffect(() => {
    let cancelled = false
    const days = PERIOD_DAYS[period]
    const from = days != null ? daysAgoStr(days) : undefined
    weightAPI.list({ limit: 1000, from })
      // chartLogs is deliberately left alone on failure: a failed refetch keeps the
      // series already on screen rather than blanking a chart that was working.
      .then(data => { if (!cancelled) { setChartLogs(data || []); setChartError(null) } })
      .catch(err => { if (!cancelled) setChartError(apiErrorMessage(err, "Couldn't load your weight trend.")) })
    return () => { cancelled = true }
  }, [period, retryKey])

  useEffect(() => {
    let cancelled = false
    weightAPI.stats()
      .then(data => { if (!cancelled) { setStats(data); setStatsError(null) } })
      .catch(err => { if (!cancelled) setStatsError(apiErrorMessage(err, "Couldn't load your weight stats.")) })
    return () => { cancelled = true }
  }, [retryKey])

  // One control puts all three reads back, so a reader never has to work out which of
  // them failed to know what to press.
  const retryAll = () => {
    setChartError(null)
    setStatsError(null)
    setRetryKey(k => k + 1)
    retryList()
  }

  // Log form
  const [newWeight, setNewWeight] = useState('')
  const [newDate, setNewDate] = useState(todayStr())
  const [newNotes, setNewNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const duplicateWarningDismissedRef = useRef(false)
  const logFormRef = useRef<HTMLFormElement>(null)

  const prefillDoneRef = useRef(false)
  useEffect(() => {
    if (!prefillDoneRef.current && items.length > 0) {
      setNewWeight(String(displayWeight(items[0].weight, settings.weight_unit)))
      prefillDoneRef.current = true
    }
  }, [items])

  // Oldest → newest for the chart
  const chartPoints: ChartPoint[] = useMemo(() => {
    return chartLogs
      .slice()
      .reverse()
      .map(l => {
        const d = dayToLocalDate(entryDay(l))
        return { ts: d.getTime(), weight: lbsToDisplay(l.weight, settings.weight_unit), date: d }
      })
  }, [chartLogs, settings.weight_unit])

  const log = useAsyncAction(async (w: number) => {
        const real = await weightAPI.log({
          weight: displayToLbs(w, settings.weight_unit),
          notes: newNotes.trim(),
          logged_at: dayToInstant(newDate),
        })
        setNewWeight(String(displayWeight(real.weight, settings.weight_unit)))
        setNewNotes('')
        setNewDate(todayStr())
        setShowNotes(false)
        duplicateWarningDismissedRef.current = false
        reload()
        weightAPI.stats().then(setStats).catch(() => {})
        const days = PERIOD_DAYS[period]
        const from = days != null ? daysAgoStr(days) : undefined
        weightAPI.list({ limit: 1000, from }).then(data => setChartLogs(data || [])).catch(() => {})
  }, 'Failed to log weight')

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault()
    if (log.busy) return
    const w = parseFloat(newWeight)
    const wErr = weightError(w, settings.weight_unit)
    if (wErr) {
      setError(wErr)
      return
    }

    if (!duplicateWarningDismissedRef.current && items.length > 0 && entryDay(items[0]) === newDate) {
      setShowDuplicateWarning(true)
      return
    }

    setError(null)
    setShowDuplicateWarning(false)
    void log.run(w)
  }

  if (initialLoading) return <Loading />


  // Period stats computed from chartLogs (period-scoped server fetch).
  // For "All" period prefer server-computed stats since they're not capped at 1000.
  const periodValues = chartLogs.map(l => l.weight) // raw lbs from DB, newest first
  const useServerAggregate = period === 'All' && stats != null
  const currentLbs = periodValues[0] ?? stats?.latest ?? items[0]?.weight ?? 0
  const oldestLbs = periodValues[periodValues.length - 1] ?? stats?.starting ?? currentLbs
  const changeLbs = currentLbs - oldestLbs
  const avgLbs = useServerAggregate
    ? (stats!.avg ?? 0)
    : (periodValues.length > 0 ? periodValues.reduce((a, b) => a + b, 0) / periodValues.length : 0)
  const minLbs = useServerAggregate
    ? (stats!.min ?? 0)
    : (periodValues.length > 0 ? Math.min(...periodValues) : 0)
  const maxLbs = useServerAggregate
    ? (stats!.max ?? 0)
    : (periodValues.length > 0 ? Math.max(...periodValues) : 0)

  // A number we never received is not zero, and neither is the average of nothing. With
  // no values to aggregate the tiles read "—" whatever the reason: an outage otherwise
  // renders "0 lb" in the same type as a real measurement, and a new account is told its
  // lowest ever weight was zero. Which of the two it is, the hero and the chart say.
  const loadFailed = chartError != null || statsError != null || listError != null

  // Scope the error to the scope of the failure. Three sections failing separately is
  // three problems and gets three errors; three sections failing because the server is
  // down is ONE problem, and four retry buttons for it are four ways to say "reload".
  const everythingFailed = chartError != null && statsError != null && listError != null
    && items.length === 0 && periodValues.length === 0

  // Nothing to aggregate. Two different reasons, and they are not the same sentence:
  // an account with no entries yet reads "—", a section whose reads failed says so
  // where the numbers would have been. A dash alone explains nothing, and the retry for
  // it belongs beside it rather than in a banner at the top of the page.
  // What the hero can honestly state. With the trend and stats reads both dead the old
  // code fell through to 0 and rendered "0 lb · no change over 30d" — a measurement, in
  // the same type as a real one — while the true latest weight sat in `items` below it.
  const currentKnown = periodValues.length > 0 || stats != null || items.length > 0
  const changeKnown = periodValues.length > 1
  const noValues = periodValues.length === 0 && (stats == null || stats.total_entries === 0)
  const figuresFailed = noValues && (chartError != null || statsError != null)
  const aggregatesUnknown = noValues && !figuresFailed

  // We do hold values, but the refresh that would have updated them failed. Keep them —
  // discarding data we have to report a failed refetch is worse — and say so under the
  // figures it applies to.
  const figuresStale = !everythingFailed && !noValues && (chartError != null || statsError != null)

  const current = displayWeight(currentLbs, settings.weight_unit)
  const change = displayWeight(changeLbs, settings.weight_unit)
  const avg = displayWeight(avgLbs, settings.weight_unit)
  const min = displayWeight(minLbs, settings.weight_unit)
  const max = displayWeight(maxLbs, settings.weight_unit)

  const trendIcon = change === 0 ? Minus : change < 0 ? TrendingDown : TrendingUp
  const TrendIcon = trendIcon
  const trendClass =
    change === 0
      ? 'bg-surface-muted border-surface-border text-tx-muted'
      : change < 0
        ? 'bg-success-500/10 border-success-500/20 text-success-400'
        : 'bg-error-500/10 border-error-500/20 text-error-400'
  const changeWord = change === 0 ? 'no change' : change < 0 ? 'lost' : 'gained'

  // Title and subtitle stay, so the reader still knows where they are; the header's
  // action does not. On an error screen the primary action is the retry, and a
  // btn-primary beside it that leads to a save which cannot succeed outranks it.
  if (everythingFailed) {
    return (
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Weight" subtitle="Track your body weight over time" />
        <ErrorState
          size="page"
          title="Couldn't load your weight"
          message={listError ?? chartError ?? statsError ?? ''}
          onRetry={retryAll}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <PageHeader
        title="Weight"
        subtitle="Track your body weight over time"
        action={<span className="badge-brand"><Calendar className="w-3 h-3" /> {wUnit}</span>}
      />

      {(error || log.error) && (
        <div className="alert-error" role="alert" aria-live="polite">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || log.error}</span>
        </div>
      )}

      {/* Quick log — at top of page so entry is reachable on first paint */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-500" />
            <h2 className="section-title">Log Weight</h2>
          </div>
          {items.length > 0 && (
            <span className="text-[11px] text-tx-muted">last: {displayWeight(items[0].weight, settings.weight_unit)} {wUnit}</span>
          )}
        </div>
        <form ref={logFormRef} onSubmit={handleLog} className="space-y-3">
          <StepperTile
            icon={Scale}
            label={`Weight (${wUnit})`}
            name="weight"
            step={BODYWEIGHT_STEP}
            onStep={d => setNewWeight(String(clampStep(parseFloat(newWeight) || 0, d, { max: maxWeight(settings.weight_unit) })))}
          >
            <NumberField value={newWeight} onChange={setNewWeight} aria-label="Weight" />
          </StepperTile>

          {showNotes ? (
            <div className="space-y-2 bg-surface-overlay border border-surface-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-tx-secondary">Date &amp; note</span>
                <button
                  type="button"
                  onClick={() => setShowNotes(false)}
                  className="p-1 hover:bg-surface-muted rounded-lg transition-colors"
                  aria-label="Collapse"
                >
                  <X className="w-3.5 h-3.5 text-tx-muted" />
                </button>
              </div>
              <DateInput value={newDate} onChange={setNewDate} max={todayStr()} />
              <input
                type="text"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Note — e.g. morning, post-run"
                maxLength={200}
                className="input"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-tx-secondary bg-surface-overlay border border-surface-border rounded-xl hover:bg-surface-muted active:scale-[0.98] transition-all"
            >
              <Calendar className="w-4 h-4 text-tx-muted" />
              Add date &amp; note
            </button>
          )}

          {showDuplicateWarning && items.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Already logged on {formatDay(entryDay(items[0]), 'MMM d')} ({displayWeight(items[0].weight, settings.weight_unit)} {wUnit}). Log again anyway?</p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateWarning(false)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-surface-overlay border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateWarningDismissedRef.current = true
                      setShowDuplicateWarning(false)
                      logFormRef.current?.requestSubmit()
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition-colors"
                  >
                    Log Anyway
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!(parseFloat(newWeight) > 0) || log.busy}
            className="btn-primary btn-lg w-full"
          >
            <Plus className="w-4 h-4" /> {log.busy ? 'Logging…' : 'Log Weight'}
          </button>
          <p className="input-help flex items-center justify-center gap-1.5 text-center">
            <Sunrise className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            Best logged in the morning, after the bathroom
          </p>
        </form>
      </div>

      {/* Current weight hero */}
      <div className="card p-6 border-brand-500/20 bg-brand-500/5">
        {items.length === 0 && loadFailed ? (
          // Empty and unreachable look identical from here, so the empty copy cannot be
          // the default: it told someone with years of entries that they had never
          // weighed themselves, and invited them to fix it against a server that was down.
          <ErrorState
            size="section"
            title="Couldn't load your weight"
            message={listError ?? chartError ?? statsError ?? ''}
            onRetry={retryAll}
          />
        ) : items.length === 0 ? (
          <div className="text-center py-2">
            <p className="stat-label mb-1">Current Weight</p>
            <p className="text-tx-muted text-sm">The scale doesn't know you exist yet. Fix that.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="stat-label mb-2">Current Weight</p>
                <div className="flex items-end gap-2">
                  <span className="stat-value text-5xl">{currentKnown ? current : '—'}</span>
                  {currentKnown && <span className="text-tx-muted text-lg mb-1">{wUnit}</span>}
                </div>
              </div>
              <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border ${trendClass} ${changeKnown ? '' : 'hidden'}`}>
                <TrendIcon className="w-4 h-4" />
                {Math.abs(change)} {wUnit}
              </div>
            </div>
            {changeKnown && (
              <p className="text-xs text-tx-muted mt-3">
                {Math.abs(change)} {wUnit} {changeWord} over {period}
              </p>
            )}
          </>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Avg', value: avg, tip: 'Average weight for selected period', icon: Activity, color: 'text-brand-400' },
          { label: 'Low', value: min, tip: 'Lowest recorded weight in period', icon: ArrowDown, color: 'text-success-400' },
          { label: 'High', value: max, tip: 'Highest recorded weight in period', icon: ArrowUp, color: 'text-error-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="stat-label">{s.label}</span>
              <HelpTip content={s.tip} />
            </div>
            {figuresFailed ? (
              <StatFailure label={`Couldn't load ${s.label.toLowerCase()} weight`} />
            ) : (
              <>
                <span className="stat-value text-xl">{aggregatesUnknown ? '—' : Math.round(s.value)}</span>
                {!aggregatesUnknown && <span className="text-xs text-tx-muted ml-1">{wUnit}</span>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Only the stale case earns a line here. When the figures never arrived the tiles
          above are already showing the failure mark, and repeating it in words underneath
          was the same thing said twice. Stale is different: the tiles are showing real
          numbers, so nothing else on screen says they are out of date. */}
      {figuresStale && (
        <div className="flex items-center gap-2 px-1 text-xs text-tx-muted" role="status">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          <span>Couldn't refresh these — showing the last we loaded.</span>
          <button onClick={retryAll} className="underline hover:text-tx-primary">Try again</button>
        </div>
      )}

      {/* Chart + period selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="section-title">Trend</h2>
          <PeriodSelector options={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {chartPoints.length === 0 && chartError ? (
          <ErrorState size="section" title="Couldn't load your trend" message={chartError} onRetry={retryAll} />
        ) : chartPoints.length === 0 ? (
          <div className="flex items-center justify-center h-44 text-tx-muted text-sm">
            No data for this period
          </div>
        ) : chartPoints.length === 1 ? (
          <div className="flex items-center justify-center h-44 text-tx-muted text-sm">
            Log another entry to see the trend
          </div>
        ) : (
          <TrendChart points={chartPoints} wUnit={wUnit} />
        )}
      </div>

      {/* History — the error sits outside the items guard on purpose: a failed first
          page leaves items empty, and the guard alone rendered nothing whatsoever. */}
      {listError && <ListError subject="your weight history" message={listError} onRetry={retryList} />}

      {items.length > 0 && (
        <>
          <h2 className="section-title px-1">History</h2>
          <div className="space-y-2">
            {items.map((entry, i) => {
              const next = items[i + 1]
              const deltaLbs = next ? entry.weight - next.weight : 0
              const displayW = displayWeight(entry.weight, settings.weight_unit)
              const displayDelta = displayWeight(Math.abs(deltaLbs), settings.weight_unit)
              return (
                <Link
                  key={entry.id}
                  to={`/weight/${entry.id}`}
                  className="card group active:scale-[0.99] transition-transform flex items-center p-4 gap-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <Scale className="w-5 h-5 text-brand-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-tx-primary tabular-nums">
                      {Math.round(displayW)} {wUnit}
                    </p>
                    <p className="text-xs text-tx-muted mt-0.5">
                      {formatDay(entryDay(entry), 'MMM d, yyyy')}
                    </p>
                    {(deltaLbs !== 0 || entry.notes) && (
                      <div className="flex items-center gap-x-2 mt-0.5 min-w-0 overflow-hidden">
                        {deltaLbs !== 0 && (
                          <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums flex-shrink-0 ${deltaLbs < 0 ? 'text-success-400' : 'text-error-400'}`}>
                            {deltaLbs < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            {Math.round(displayDelta)}
                          </span>
                        )}
                        {deltaLbs !== 0 && entry.notes && <span className="text-tx-muted/40 text-xs flex-shrink-0">·</span>}
                        {entry.notes && (
                          <span className="text-xs text-tx-muted truncate">{entry.notes}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
                </Link>
              )
            })}
          </div>
          <div ref={sentinelRef} />
          {hasMore && listLoading && (
            <p className="text-center text-xs text-tx-muted py-2">Loading more…</p>
          )}
        </>
      )}

    </div>
  )
}
