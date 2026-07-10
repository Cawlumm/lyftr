import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

// The web app's full-screen loader (web/src/components/Loading.tsx), ported 1:1: a
// barbell that dips and flexes under load like a rep, five rep-dots blinking in a
// chase, and the lyftr / LOADING wordmark. Geometry is in explicit px (the web uses
// absolute Tailwind offsets, several non-standard) so the rig reads identically on
// RN. Motion is on the UI thread via Reanimated (CSS @keyframes have no RN analog).

const CYCLE = 1600 // ms — matches the web loop
const DIP = 18 // px the bar assembly drops at the bottom of the rep
const DOTS = 5

// The rep timeline as progress breakpoints (0..1 of CYCLE): hold up, dip + flex,
// hold at bottom, drive back up, hold. Same stops as the web pivot/flex keyframes.
const STOPS = [0, 0.45, 0.55, 0.65, 0.8, 1]
const DIP_AT = [0, 0, DIP, DIP, 0, 0]
const FLEX_AT = [1, 1, 0.55, 0.55, 1, 1]

// One lit rep-dot in the chase — owns its own clock so the five stagger cleanly.
function RepDot({ index, mutedColor }: { index: number; mutedColor: string }) {
  const on = useSharedValue(0)
  useEffect(() => {
    on.value = withDelay(
      index * 160,
      withRepeat(withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: CYCLE - 260, easing: Easing.in(Easing.quad) }),
      ), -1),
    )
    return () => cancelAnimation(on)
  }, [index, on])

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [mutedColor, '#00b8d9']),
    shadowOpacity: on.value * 0.5,
    transform: [{ scale: 0.9 + on.value * 0.15 }],
  }))

  return (
    <Animated.View
      style={[
        { width: 10, height: 10, borderRadius: 5, shadowColor: '#00b8d9', shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        style,
      ]}
    />
  )
}

export function Loading({ sublabel = 'Loading' }: { sublabel?: string }) {
  const { colors, brand } = useTheme()
  const t = useSharedValue(0)

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1)
    return () => cancelAnimation(t)
  }, [t])

  // The whole bar assembly (bar + plates + collars) dips together.
  const assembly = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, STOPS, DIP_AT) }],
  }))
  // Only the bar itself flexes (compresses vertically) under the load.
  const barFlex = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(t.value, STOPS, FLEX_AT) }],
  }))

  // A plate: brand-outlined disc on the overlay surface, inset glow (via border).
  const plate = (w: number, h: number, left: number | undefined, right: number | undefined, top: number) => (
    <View
      style={{
        position: 'absolute', width: w, height: h, top, left, right,
        borderRadius: 3, backgroundColor: colors.overlay, borderWidth: 1, borderColor: brand.cyan,
      }}
    />
  )
  const tick = (side: 'left' | 'right', top: number) => (
    <View style={{ position: 'absolute', [side]: -3, top, width: 10, height: 2, borderRadius: 1, backgroundColor: colors.muted }} />
  )

  return (
    <View className="flex-1 items-center justify-center bg-surface-base" style={{ gap: 44 }}>
      {/* Barbell rig — 224×96 canvas, origin of the animated assembly at (112, 28). */}
      <View style={{ width: 224, height: 96 }}>
        {/* Uprights */}
        <View style={{ position: 'absolute', left: 16, top: 0, height: 80, width: 4, borderRadius: 2, backgroundColor: colors.muted }}>
          {tick('left', 28)}
          {tick('left', 48)}
        </View>
        <View style={{ position: 'absolute', right: 16, top: 0, height: 80, width: 4, borderRadius: 2, backgroundColor: colors.muted }}>
          {tick('right', 28)}
          {tick('right', 48)}
        </View>

        {/* Bar assembly (pivots) */}
        <Animated.View style={[{ position: 'absolute', left: 112, top: 28 }, assembly]}>
          {/* Bar (flexes) */}
          <Animated.View style={barFlex}>
            <LinearGradient
              colors={['#38d8fb', '#00b8d9', '#007a96']}
              locations={[0, 0.6, 1]}
              style={{ position: 'absolute', left: -96, top: -4, width: 192, height: 6, borderRadius: 3 }}
            />
          </Animated.View>

          {/* Plates — outer→inner, growing taller inward, mirrored L/R. */}
          {plate(16, 32, -112, undefined, -12)}
          {plate(14, 40, -96, undefined, -16)}
          {plate(12, 48, -80, undefined, -20)}
          {plate(16, 32, undefined, -112, -12)}
          {plate(14, 40, undefined, -96, -16)}
          {plate(12, 48, undefined, -80, -20)}

          {/* Collars */}
          <View style={{ position: 'absolute', left: -68, top: -8, width: 4, height: 22, borderRadius: 2, backgroundColor: brand.cyan }} />
          <View style={{ position: 'absolute', right: -68, top: -8, width: 4, height: 22, borderRadius: 2, backgroundColor: brand.cyan }} />
        </Animated.View>
      </View>

      {/* Rep dots */}
      <View className="flex-row" style={{ gap: 10 }}>
        {Array.from({ length: DOTS }, (_, i) => (
          <RepDot key={i} index={i} mutedColor={colors.muted} />
        ))}
      </View>

      {/* Wordmark */}
      <View className="items-center">
        <AppText variant="heading" className="tracking-tight">lyftr</AppText>
        <AppText variant="label" color="muted" className="mt-2 uppercase" style={{ letterSpacing: 3 }}>
          {sublabel}
        </AppText>
      </View>
    </View>
  )
}
