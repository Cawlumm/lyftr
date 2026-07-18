import { useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'

// react-native-svg reimplementations of the web Dashboard's recharts widgets (bar /
// line / donut) plus the custom MuscleSparkline (already raw SVG on web). Web reads
// values via hover tooltips; on mobile these expose the same data via tap-to-read
// (the pattern shipped on ExerciseDetail + Weight), with a selection haptic per tap.
// The generic charts keep web's indigo (#6366f1); the donut keeps web's per-muscle
// palette (passed in via colorFor).

const INDIGO = '#6366f1'

// Monotone cubic (Fritsch–Carlson) — matches recharts type="monotone" (same curve the
// weight sparkline draws on web).
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

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
// Any NaN/Infinity reaching react-native-svg (path/rect/circle geometry) crashes the
// native renderer — coerce every value fed to SVG through this first.
const fin = (n: number) => (Number.isFinite(n) ? n : 0)
const tap = (fn: () => void) => { Haptics.selectionAsync().catch(() => {}); fn() }

// ── Volume bar chart ────────────────────────────────────────────────────────
export interface VolumePoint { date: string; volume: number; name: string }

export function VolumeBarChart({ data, width, unit, height = 130 }: {
  data: VolumePoint[]; width: number; unit: string; height?: number
}) {
  const { colors } = useTheme()
  const [sel, setSel] = useState<number | null>(null)
  if (!data.length || width <= 0) return null

  const axisH = 18
  const padTop = 16
  const plotH = height - axisH - padTop
  const n = data.length
  const slot = width / n
  const barW = Math.min(18, slot * 0.55)
  const vols = data.map((d) => fin(d.volume)) // sanitize: one NaN would poison maxVol
  const maxVol = Math.max(...vols, 1)
  const xCenter = (i: number) => slot * i + slot / 2

  // Thin x-labels so they never overlap (recharts auto-skips too).
  const maxLabels = Math.max(2, Math.floor(width / 40))
  const every = Math.ceil(n / maxLabels)

  const selPt = sel != null ? data[sel] : null

  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const h = Math.max((vols[i] / maxVol) * plotH, 1)
          const x = xCenter(i) - barW / 2
          const y = padTop + (plotH - h)
          const isLast = i === n - 1
          return (
            <Rect key={i} x={x} y={y} width={barW} height={h} rx={4}
              fill={INDIGO} fillOpacity={sel === i ? 1 : isLast ? 1 : 0.25} />
          )
        })}
        {/* full-height transparent hit targets */}
        {data.map((_, i) => (
          <Rect key={`hit-${i}`} x={slot * i} y={0} width={slot} height={padTop + plotH}
            fill="transparent" onPress={() => tap(() => setSel((c) => (c === i ? null : i)))} />
        ))}
        {data.map((d, i) =>
          i % every === 0 || i === n - 1 ? (
            <SvgText key={`lbl-${i}`} x={xCenter(i)} y={height - 4} fontSize={10} fill={colors.txMuted}
              textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>
              {d.date}
            </SvgText>
          ) : null
        )}
      </Svg>
      {selPt ? (
        <View pointerEvents="none"
          className="absolute rounded-lg border border-surface-border bg-surface-raised px-2 py-1"
          style={{ left: clamp(xCenter(sel!) - 55, 0, Math.max(0, width - 110)), top: 0, maxWidth: 130 }}>
          <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
            {selPt.volume.toLocaleString()} {unit}
          </AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>{selPt.name}</AppText>
        </View>
      ) : null}
    </View>
  )
}

// ── Weight sparkline ────────────────────────────────────────────────────────
export interface SparkPoint { date: string; weight: number }

export function WeightSparkline({ data, width, unit, height = 48 }: {
  data: SparkPoint[]; width: number; unit: string; height?: number
}) {
  const { colors } = useTheme()
  const [sel, setSel] = useState<number | null>(null)
  if (data.length < 2 || width <= 0) return null

  const pad = 4
  const ws = data.map((d) => fin(d.weight))
  const min = Math.min(...ws), max = Math.max(...ws), range = max - min || 1
  const stepX = (width - pad * 2) / (data.length - 1)
  const xAt = (i: number) => pad + i * stepX
  const yAt = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2)
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.weight) }))
  const sp = sel != null ? pts[sel] : null

  return (
    <View>
      <Svg width={width} height={height}>
        {sp ? <Line x1={sp.x} y1={0} x2={sp.x} y2={height} stroke={colors.txMuted} strokeWidth={1} opacity={0.4} /> : null}
        <Path d={monotonePath(pts)} fill="none" stroke={INDIGO} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {sp ? <Circle cx={sp.x} cy={sp.y} r={3} fill={INDIGO} /> : null}
        {pts.map((p, i) => (
          <Circle key={`hit-${i}`} cx={p.x} cy={p.y} r={Math.max(10, stepX / 2)} fill="transparent"
            onPress={() => tap(() => setSel((c) => (c === i ? null : i)))} />
        ))}
      </Svg>
      {sp && sel != null ? (
        <View pointerEvents="none"
          className="absolute rounded-lg border border-surface-border bg-surface-raised px-2 py-1"
          style={{ left: clamp(sp.x - 45, 0, Math.max(0, width - 90)), top: -6 }}>
          <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
            {data[sel].weight} {unit} · {data[sel].date}
          </AppText>
        </View>
      ) : null}
    </View>
  )
}

// ── Muscle-balance donut ────────────────────────────────────────────────────
export interface DonutSlice { name: string; value: number }

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
const donutSeg = (cx: number, cy: number, ro: number, ri: number, d0: number, d1: number) => {
  const large = d1 - d0 <= 180 ? 0 : 1
  const o0 = polar(cx, cy, ro, d0), o1 = polar(cx, cy, ro, d1)
  const i1 = polar(cx, cy, ri, d1), i0 = polar(cx, cy, ri, d0)
  return `M ${o0.x} ${o0.y} A ${ro} ${ro} 0 ${large} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${ri} ${ri} 0 ${large} 0 ${i0.x} ${i0.y} Z`
}

export function MuscleDonut({ data, total, colorFor, size = 160 }: {
  data: DonutSlice[]; total: number; colorFor: (name: string) => string; size?: number
}) {
  const { colors } = useTheme()
  const [sel, setSel] = useState<number | null>(null)
  if (!data.length || total <= 0) return null

  const cx = size / 2, cy = size / 2
  const rOuter = size / 2 - 4
  const rInner = rOuter * 0.62
  const GAP = 2 // deg between slices

  let cum = 0
  const slices = data.map((d) => {
    const sweep = (d.value / total) * 360
    const s0 = cum
    cum += sweep
    return { d, s0, s1: cum, sweep }
  })

  const selSlice = sel != null ? slices[sel] : null

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {slices.map((s, i) => {
          if (s.sweep < 0.1) return null // skip empty slices (degenerate zero-length arc)
          // Leave the padding gap only when the slice is wide enough for it.
          const a0 = s.sweep > GAP ? s.s0 + GAP / 2 : s.s0
          let a1 = s.sweep > GAP ? s.s1 - GAP / 2 : s.s1
          // A single 360° slice makes start==end — a degenerate arc that crashes
          // react-native-svg. Clamp just shy of full so it draws an almost-complete ring.
          if (a1 - a0 >= 359.999) a1 = a0 + 359.9
          return (
            <Path key={i} d={donutSeg(cx, cy, rOuter, rInner, a0, a1)}
              fill={colorFor(s.d.name)} fillOpacity={sel == null || sel === i ? 0.85 : 0.3}
              onPress={() => tap(() => setSel((c) => (c === i ? null : i)))} />
          )
        })}
      </Svg>
      {/* Tap-to-read: the selected slice's stats fill the donut hole (web showed a hover
          tooltip; the legend already lists every value, so the hole is the natural read-out). */}
      {selSlice ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color="muted" className="capitalize" numberOfLines={1}>{selSlice.d.name}</AppText>
          <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>{selSlice.d.value}</AppText>
          <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {Math.round((selSlice.d.value / total) * 100)}%
          </AppText>
        </View>
      ) : (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'], color: colors.txMuted }}>{total}</AppText>
          <AppText variant="caption" color="muted">sets</AppText>
        </View>
      )}
    </View>
  )
}

// ── Muscle mini-sparkline (legend rows) ─────────────────────────────────────
// Direct port of web MuscleSparkline: 56×24 line, filled area + thicker stroke when
// it's the top muscle, end dot. No interaction (web had none).
export function MuscleSparkline({ values, color, isTop }: { values: number[]; color: string; isTop: boolean }) {
  if (values.length < 2) return <View style={{ width: 56, height: 24 }} />
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const W = 56, H = 24
  const pts = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * W,
    H - 4 - ((v - min) / range) * (H - 8),
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${W},${H} L0,${H} Z`
  const last = pts[pts.length - 1]
  return (
    <Svg width={W} height={H}>
      {isTop ? <Path d={area} fill={color} fillOpacity={0.12} /> : null}
      <Path d={d} fill="none" stroke={color} strokeWidth={isTop ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round" strokeOpacity={isTop ? 1 : 0.6} />
      <Circle cx={last[0]} cy={last[1]} r={isTop ? 2.5 : 1.5} fill={color} fillOpacity={isTop ? 1 : 0.7} />
    </Svg>
  )
}
