import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Barcode } from 'lucide-react-native'
import { eanModules, formatBarcode } from '@lyftr/shared'
import { AppText, Card } from '../ui'
import { useTheme } from '../../theme/useTheme'

// When a lookup has run this long, say so: the silence past this point is what made
// people rescan (#164). Open Food Facts routinely takes a few seconds.
const SLOW_AFTER_MS = 4000

const WIDTH = 144
const HEIGHT = 56
// Start, centre and end guards drop below the other bars, as they do on a pack.
const GUARD_BARS = new Set([0, 2, 46, 48, 92, 94])
const SHORT_BAR = HEIGHT * (40 / 46)

// The barcode that was scanned, drawn from its digits, with a glyph for any symbology
// we don't draw. One View per run of bar modules.
function Bars({ code, color }: { code: string; color: string }) {
  const modules = eanModules(code)
  if (!modules) return <Barcode size={HEIGHT} color={color} strokeWidth={1.5} style={{ alignSelf: 'center' }} />
  const unit = WIDTH / modules.length
  const bars = []
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue
    const start = i
    while (modules[i + 1] === '1') i++
    bars.push(
      <View
        key={start}
        style={{
          position: 'absolute', top: 0, left: start * unit, width: (i - start + 1) * unit,
          height: GUARD_BARS.has(start) ? HEIGHT : SHORT_BAR, backgroundColor: color,
        }}
      />,
    )
  }
  return <>{bars}</>
}

// Shown in place of the results while a scanned code is looked up: the barcode and its
// digits, as printed on the pack, so the scan visibly landed. Mirrors web BarcodeLookup.
export function BarcodeLookup({ code }: { code: string }) {
  const { colors, accent } = useTheme()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  // The scanner's read line passing over the bars; still, mid-way, for reduced motion.
  const reduceMotion = useReducedMotion()
  const sweep = useSharedValue(0.5)
  useEffect(() => {
    if (reduceMotion) return
    sweep.value = 0.08
    sweep.value = withRepeat(withTiming(0.88, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true)
    return () => cancelAnimation(sweep)
  }, [reduceMotion, sweep])
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * HEIGHT }] }))

  return (
    <Card className="items-center px-6 py-9" accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <View style={{ width: WIDTH, height: HEIGHT }} importantForAccessibility="no-hide-descendants">
        <Bars code={code} color={colors.txPrimary} />
        <Animated.View style={[{ position: 'absolute', left: -8, right: -8, top: -3 }, line]}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: accent, opacity: 0.25 }} />
          <View style={{ position: 'absolute', top: 2, left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: accent }} />
        </Animated.View>
      </View>
      <AppText variant="heading" className="mt-2" style={{ fontVariant: ['tabular-nums'], letterSpacing: 2.4 }}>
        {formatBarcode(code)}
      </AppText>
      <AppText variant="body" color="muted" className="mt-3 text-center">
        {slow ? 'Still looking. This can take a few seconds.' : 'Looking up this product…'}
      </AppText>
    </Card>
  )
}
