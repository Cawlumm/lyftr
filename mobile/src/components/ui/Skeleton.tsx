import { useEffect, useState } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../theme/useTheme'
import { Card } from './Card'

// A shimmering placeholder block — the skeleton-screen primitive. Research is clear
// that skeletons beat spinners for *content* loads (users read them as ~20–30% faster
// because the layout is already there), and that a slow left→right SWEEP is perceived
// as shorter than a pulse. So this is a muted rounded box with a highlight band that
// sweeps across on a ~1.2s loop, clipped by overflow-hidden. Compose these into
// content-shaped skeletons (see WorkoutsSkeleton); never use it for confirmations —
// a spinner is right there.
const SWEEP_MS = 1200

interface Props {
  /** Explicit width; omit to fill the parent (flex/stretch) and measure via onLayout. */
  width?: number | string
  height?: number
  radius?: number
  style?: ViewStyle
  className?: string
}

export function Skeleton({ width, height = 14, radius = 8, style, className }: Props) {
  const { colors, isDark } = useTheme()
  // The sweep needs a pixel width to translate across; capture it once laid out.
  const [w, setW] = useState(typeof width === 'number' ? width : 0)
  const t = useSharedValue(0)

  useEffect(() => {
    if (!w) return
    t.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }), -1, false)
  }, [w, t])

  // Band travels from fully off the left edge to fully off the right edge.
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -w + t.value * (2 * w) }] }))

  // A translucent-white highlight reads as a shimmer on both themes (bright sweep on
  // light, faint on dark) without needing a second solid token.
  const highlight = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)'
  const edge = isDark ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0)'

  return (
    <View
      onLayout={typeof width === 'number' ? undefined : (e) => setW(e.nativeEvent.layout.width)}
      style={[{ width: width as ViewStyle['width'], height, borderRadius: radius, backgroundColor: colors.muted, overflow: 'hidden' }, style]}
      className={className}
    >
      {w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { width: w }, sweep]}>
          <LinearGradient
            colors={[edge, highlight, edge]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

// ── Reusable composites ─────────────────────────────────────────────────────────
// These build content-shaped skeletons out of the atom above so any list/detail page
// (Workouts, Weight, Dashboard, future Food/Programs) can drop one in without
// re-deriving line widths and card geometry. Compose them; only page-unique bits
// (e.g. a chart placeholder) need bespoke <Skeleton/> blocks.

// A stack of text-line placeholders: a heavier "title" line then lighter meta lines.
// widths cycle so successive lines look naturally ragged.
export function SkeletonText({ lines = 2, widths, style }: {
  lines?: number
  widths?: (number | string)[]
  style?: ViewStyle
}) {
  const W = widths ?? ['60%', '42%', '34%']
  return (
    <View style={style} className="gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={W[i % W.length]} height={i === 0 ? 15 : 11} radius={i === 0 ? 6 : 5} />
      ))}
    </View>
  )
}

// A generic list-row placeholder inside a Card: optional leading square (thumbnail),
// text lines, optional trailing glyph — the shape of the app's card list rows.
export function SkeletonListRow({ avatar = 44, lines = 3, trailing = true }: {
  avatar?: number | false
  lines?: number
  trailing?: boolean
}) {
  return (
    <Card className="flex-row items-center gap-3 rounded-2xl">
      {avatar !== false ? <Skeleton width={avatar} height={avatar} radius={12} /> : null}
      <SkeletonText lines={lines} style={{ flex: 1 }} />
      {trailing ? <Skeleton width={20} height={20} radius={6} /> : null}
    </Card>
  )
}

// `count` list-row placeholders with the app's standard row gap — a drop-in for any
// paginated list's initial load. Extra props forward to each row.
export function SkeletonList({ count = 6, ...row }: {
  count?: number
} & Parameters<typeof SkeletonListRow>[0]) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListRow key={i} {...row} />
      ))}
    </View>
  )
}

// A single summary-stat card placeholder (label + big value), and a row of them — the
// shape used by the Workouts/Weight/Dashboard stat grids.
export function SkeletonStat() {
  return (
    <Card className="flex-1 rounded-2xl" style={{ paddingHorizontal: 12 }}>
      <Skeleton width={40} height={10} radius={4} />
      <View className="mt-2.5">
        <Skeleton width={52} height={22} radius={6} />
      </View>
    </Card>
  )
}

export function SkeletonStatRow({ count = 3 }: { count?: number }) {
  return (
    <View className="flex-row gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </View>
  )
}
