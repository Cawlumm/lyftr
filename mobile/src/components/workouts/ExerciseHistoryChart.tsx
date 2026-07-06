import { useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'

// Weight-progression chart for ExerciseDetail. Ported from web's recharts LineChart
// (monotone line #0891b2, per-point dots, x-axis date ticks, tap-to-read replacing the
// hover tooltip) and extended for mobile with a real Y AXIS — left-gutter weight ticks +
// faint gridlines on a "nice" rounded scale (web hid its Y axis; on a phone the values
// aren't otherwise readable). react-native-svg only (Expo-Go safe).
export interface ChartPoint {
  /** x-axis label, already formatted as web's 'M/d'. */
  date: string
  /** y value in the user's display unit (web's displayWeight(max_weight)). */
  weight: number
}

const STROKE = '#0891b2' // web Line stroke / dot fill (cyan-600)

// Monotone cubic (Fritsch–Carlson) path — matches recharts' type="monotone" curve so the
// line reads identically to web rather than as straight segments.
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 2) return ''
  const dx: number[] = [], dy: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x
    dy[i] = pts[i + 1].y - pts[i].y
    m[i] = dy[i] / dx[i]
  }
  const tan: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) tan[i] = 0
    else tan[i] = (m[i - 1] + m[i]) / 2
  }
  tan[n - 1] = m[n - 2]
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3
    const c1y = pts[i].y + (tan[i] * dx[i]) / 3
    const c2x = pts[i + 1].x - dx[i] / 3
    const c2y = pts[i + 1].y - (tan[i + 1] * dx[i]) / 3
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

// Round `x` to a "nice" 1/2/5/10 magnitude — the classic axis-tick heuristic, so the Y
// scale lands on human numbers (200 / 220 / 240) instead of raw data min/max.
function niceNum(x: number, round: boolean): number {
  const exp = Math.floor(Math.log10(x))
  const frac = x / Math.pow(10, exp)
  let nf: number
  if (round) nf = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10
  else nf = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nf * Math.pow(10, exp)
}

// A padded, rounded [lo, hi] domain + evenly-spaced tick values for the Y axis.
function niceScale(min: number, max: number, count = 3): { lo: number; hi: number; ticks: number[] } {
  if (max - min < 1e-9) return { lo: min - 1, hi: min + 1, ticks: [min] } // flat line
  const step = niceNum((max - min) / (count - 1), true)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return { lo, hi, ticks }
}

const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export function ExerciseHistoryChart({
  data,
  width,
  unit,
  height = 132,
}: {
  data: ChartPoint[]
  width: number
  unit: string
  height?: number
}) {
  const { colors } = useTheme()
  const [selected, setSelected] = useState<number | null>(null)
  if (data.length < 2 || width <= 0) return null

  const padLeft = 48 // gutter for Y-axis weight labels (value + unit)
  const padRight = 12
  const padTop = 12
  const axisH = 18 // room for x-axis date labels below the plot
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - axisH

  const weights = data.map((d) => d.weight)
  const { lo, hi, ticks } = niceScale(Math.min(...weights), Math.max(...weights))
  const range = hi - lo || 1
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0
  const xAt = (i: number) => padLeft + i * stepX
  const yAt = (v: number) => padTop + (1 - (v - lo) / range) * plotH
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.weight) }))

  // Thin the x-axis labels so they never overlap (recharts auto-skips ticks too).
  const maxLabels = Math.max(2, Math.floor(plotW / 44))
  const labelEvery = Math.ceil(data.length / maxLabels)

  const sel = selected != null ? pts[selected] : null

  // Area under the curve = the line path, dropped to the plot baseline and closed.
  const baseline = padTop + plotH
  const areaPath = `${monotonePath(pts)} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="exHistArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={STROKE} stopOpacity={0.22} />
            <Stop offset="1" stopColor={STROKE} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Y-axis gridlines + weight tick labels */}
        {ticks.map((t) => {
          const y = yAt(t)
          return (
            <Line key={`grid-${t}`} x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={colors.border} strokeWidth={1} opacity={0.5} />
          )
        })}
        {/* Value + unit (lb/kg) so the axis reads absolutely; the unit is driven by the
            weight_unit setting (values already converted upstream), so it updates on toggle.
            Right-aligned with a gap before the plot so the unit doesn't butt the line. */}
        {ticks.map((t) => (
          <SvgText key={`yl-${t}`} x={padLeft - 12} y={yAt(t) + 3} fontSize={10} fill={colors.txMuted} textAnchor="end">
            {`${fmtTick(t)} ${unit}`}
          </SvgText>
        ))}

        {/* Gradient area under the curve (drawn under the line). */}
        <Path d={areaPath} fill="url(#exHistArea)" stroke="none" />
        {/* Guide line to the selected point (drawn under the line + dots). */}
        {sel ? (
          <Line x1={sel.x} y1={padTop} x2={sel.x} y2={padTop + plotH} stroke={colors.txMuted} strokeWidth={1} opacity={0.5} />
        ) : null}
        <Path d={monotonePath(pts)} fill="none" stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={selected === i ? 5 : 3}
            fill={selected === i ? '#ffffff' : STROKE}
            stroke={STROKE}
            strokeWidth={selected === i ? 2.5 : 0}
          />
        ))}
        {/* Larger transparent hit targets so tapping near a point selects it (touch
            equivalent of recharts' hover tooltip). */}
        {pts.map((p, i) => (
          <Circle
            key={`hit-${i}`}
            cx={p.x}
            cy={p.y}
            r={Math.max(12, stepX / 2)}
            fill="transparent"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              setSelected((cur) => (cur === i ? null : i))
            }}
          />
        ))}
        {/* x-axis date ticks */}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <SvgText
              key={`lbl-${i}`}
              x={pts[i].x}
              y={height - 4}
              fontSize={10}
              fill={colors.txMuted}
              textAnchor={i === data.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
            >
              {d.date}
            </SvgText>
          ) : null
        )}
      </Svg>
      {/* Tap-to-read bubble: mirrors web tooltip content "{weight} {unit} · Max weight". */}
      {sel && selected != null ? (
        <View
          pointerEvents="none"
          className="absolute rounded-lg border border-surface-border bg-surface-raised px-2 py-1"
          style={{
            left: Math.min(Math.max(sel.x - 44, padLeft), Math.max(0, width - 88)),
            top: Math.max(sel.y - 34, 0),
          }}
        >
          <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
            {data[selected].weight} {unit} · Max weight
          </AppText>
        </View>
      ) : null}
    </View>
  )
}
