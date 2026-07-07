import { useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { format } from 'date-fns'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { MACRO_COLORS } from './nutritionMeta'

// react-native-svg reimplementations of the web Nutrition page's recharts/SVG widgets:
//  • MacroRing  — the per-macro progress ring (web drew a raw <svg> ring already).
//  • MacroHistoryChart — web's stacked AreaChart of protein/carbs/fat over time. Web
//    reads a day's values via a hover tooltip; on mobile we expose the same data via
//    tap-to-read (the pattern shipped on Weight / ExerciseDetail / Dashboard).
// Any NaN/Infinity reaching react-native-svg geometry crashes the native renderer, so
// every value fed to a path/rect/circle is coerced through fin() first.

const fin = (n: number) => (Number.isFinite(n) ? n : 0)
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const tap = (fn: () => void) => { Haptics.selectionAsync().catch(() => {}); fn() }

// ── MacroRing ───────────────────────────────────────────────────────────────
// Direct port of web Food.tsx <MacroRing/>: a 72×72 ring, r=30, stroke 5, rotated so
// the fill starts at 12 o'clock; center % + "{value}g" and "{label} / {target}g" below.
export function MacroRing({ value, target, color, label }: {
  value: number; target: number; color: string; label: string
}) {
  const r = 30
  const size = 72
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const pct = clamp(fin(value) / Math.max(fin(target), 1), 0, 1)

  return (
    <View className="flex-col items-center gap-1.5">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Rotate -90° so the arc starts at 12 o'clock. originX/originY as numbers +
              string strokeDasharray keep react-native-svg happy on native. */}
          <G rotation={-90} originX={cx} originY={cx}>
            <Circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={5} />
            <Circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${circ}`}
              strokeDashoffset={circ * (1 - pct)}
            />
          </G>
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" style={{ color, fontVariant: ['tabular-nums'], fontWeight: '700' }}>
            {Math.round(pct * 100)}%
          </AppText>
        </View>
      </View>
      <View className="items-center">
        <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(fin(value))}g</AppText>
        <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>{label} / {Math.round(fin(target))}g</AppText>
      </View>
    </View>
  )
}

// ── Macro history stacked-area chart ──────────────────────────────────────────
export interface MacroHistoryPoint { date: string; protein: number; carbs: number; fat: number }

export function MacroHistoryChart({ data, width, height = 200 }: {
  data: MacroHistoryPoint[]; width: number; height?: number
}) {
  const { colors } = useTheme()
  const [sel, setSel] = useState<number | null>(null)
  if (!data.length || width <= 0) return null

  const yAxisW = 34
  const axisH = 18
  const padTop = 8
  const plotW = Math.max(0, width - yAxisW)
  const plotH = Math.max(0, height - axisH - padTop)
  const n = data.length

  const P = data.map((d) => fin(d.protein))
  const C = data.map((d) => fin(d.carbs))
  const F = data.map((d) => fin(d.fat))
  const totals = data.map((_, i) => P[i] + C[i] + F[i])
  const maxTotal = Math.max(...totals, 1)

  const xAt = (i: number) => (n === 1 ? yAxisW + plotW / 2 : yAxisW + (i / (n - 1)) * plotW)
  const yAt = (v: number) => padTop + (1 - clamp(v, 0, maxTotal) / maxTotal) * plotH

  // Bottom→top stack order matches web's Area declaration order (fat, carbs, protein).
  const cumFat = F
  const cumCarbs = F.map((f, i) => f + C[i])
  const layers = [
    { key: 'fat', color: MACRO_COLORS.fat, lo: F.map(() => 0), hi: cumFat },
    { key: 'carbs', color: MACRO_COLORS.carbs, lo: cumFat, hi: cumCarbs },
    { key: 'protein', color: MACRO_COLORS.protein, lo: cumCarbs, hi: totals },
  ]

  const areaPath = (lo: number[], hi: number[]) => {
    if (n < 2) return ''
    const top = hi.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ')
    const bottom = lo.map((_, k) => { const i = n - 1 - k; return `L ${xAt(i)} ${yAt(lo[i])}` }).join(' ')
    return `${top} ${bottom} Z`
  }

  // Thin x-labels so they never overlap (recharts auto-skips too).
  const maxLabels = Math.max(2, Math.floor(plotW / 44))
  const every = Math.ceil(n / maxLabels)
  const fmt = (d: string) => format(new Date(d + 'T12:00:00'), 'M/d')

  const selPt = sel != null ? data[sel] : null

  return (
    <View>
      <Svg width={width} height={height}>
        {/* y grid: baseline + max */}
        <Line x1={yAxisW} y1={yAt(0)} x2={width} y2={yAt(0)} stroke={colors.border} strokeWidth={1} />
        <SvgText x={yAxisW - 6} y={yAt(maxTotal) + 4} fontSize={10} fill={colors.txMuted} textAnchor="end">
          {Math.round(maxTotal)}g
        </SvgText>
        <SvgText x={yAxisW - 6} y={yAt(0) + 4} fontSize={10} fill={colors.txMuted} textAnchor="end">0g</SvgText>

        {/* stacked areas (n>=2) or stacked bars (n===1) */}
        {n >= 2
          ? layers.map((L) => (
              <Path key={L.key} d={areaPath(L.lo, L.hi)} fill={L.color} fillOpacity={0.35} stroke={L.color} strokeWidth={1.5} strokeLinejoin="round" />
            ))
          : layers.map((L) => {
              const y = yAt(L.hi[0])
              const h = Math.max(0, yAt(L.lo[0]) - y)
              return <Rect key={L.key} x={xAt(0) - 14} y={y} width={28} height={h} fill={L.color} fillOpacity={0.5} />
            })}

        {/* selection guide */}
        {sel != null ? <Line x1={xAt(sel)} y1={padTop} x2={xAt(sel)} y2={yAt(0)} stroke={colors.txMuted} strokeWidth={1} opacity={0.4} /> : null}

        {/* full-height transparent hit targets */}
        {data.map((_, i) => {
          const slot = n === 1 ? plotW : plotW / (n - 1)
          const x = n === 1 ? yAxisW : clamp(xAt(i) - slot / 2, yAxisW, width)
          const w = n === 1 ? plotW : slot
          return <Rect key={`hit-${i}`} x={x} y={0} width={w} height={padTop + plotH} fill="transparent" onPress={() => tap(() => setSel((c) => (c === i ? null : i)))} />
        })}

        {/* x labels */}
        {data.map((d, i) =>
          i % every === 0 || i === n - 1 ? (
            <SvgText key={`lbl-${i}`} x={xAt(i)} y={height - 4} fontSize={10} fill={colors.txMuted} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>
              {fmt(d.date)}
            </SvgText>
          ) : null
        )}
      </Svg>

      {selPt ? (
        <View
          pointerEvents="none"
          className="absolute rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5"
          style={{ left: clamp(xAt(sel!) - 60, 0, Math.max(0, width - 120)), top: 0, width: 120 }}
        >
          <AppText variant="caption" color="muted">{format(new Date(selPt.date + 'T12:00:00'), 'MMM d')}</AppText>
          <View className="mt-0.5 gap-0.5">
            {[
              { label: 'Protein', value: selPt.protein, color: MACRO_COLORS.protein },
              { label: 'Carbs', value: selPt.carbs, color: MACRO_COLORS.carbs },
              { label: 'Fat', value: selPt.fat, color: MACRO_COLORS.fat },
            ].map((m) => (
              <View key={m.label} className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: m.color }} />
                  <AppText variant="caption" color="muted">{m.label}</AppText>
                </View>
                <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(fin(m.value))}g</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}
