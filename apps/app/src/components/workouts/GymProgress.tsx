import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import { formatElapsed, useElapsedSeconds, useTranslation } from '@lyftr/shared'
import { useMotion } from '../../lib/useMotion'
import { useTheme } from '../../theme/useTheme'

/** The workout's running time over its set count. Its own component so the once-a-second tick
 *  re-renders these two lines, not the whole gym screen. */
export function ElapsedClock({ startedAt, done, total }: { startedAt: string; done: number; total: number }) {
  const { t } = useTranslation()
  const time = formatElapsed(useElapsedSeconds(startedAt))
  return (
    <View testID="gym-clock" className="min-w-0 flex-1 justify-center">
      {/* A timer is not a live region, so the label changing each second is not announced. */}
      <Text
        accessibilityRole="timer"
        accessibilityLabel={t('gym.elapsed', { time })}
        className="font-display text-xl leading-[22px] text-tx-primary"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {time}
      </Text>
      <Text numberOfLines={1} className="font-sans text-xs text-tx-muted" style={{ fontVariant: ['tabular-nums'] }}>
        {t('workouts.active.setProgress', { done, total })}
      </Text>
    </View>
  )
}

function Segment({ index, value, current }: { index: number; value: number; current: boolean }) {
  const { accent } = useTheme()
  const { base } = useMotion()
  const clamped = Math.max(0, Math.min(1, value))
  const scale = useRef(new Animated.Value(clamped)).current
  useEffect(() => {
    if (base === 0) { scale.stopAnimation(); scale.setValue(clamped); return }
    Animated.timing(scale, {
      toValue: clamped, duration: base, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [clamped, base, scale])
  return (
    <View
      testID={`gym-progress-seg-${index}`}
      className={`h-1 flex-1 overflow-hidden rounded-sm ${current ? 'bg-brand-500/30' : 'bg-surface-border'}`}
    >
      {/* Grows by transform, so nothing re-lays out. */}
      <Animated.View
        testID={`gym-progress-fill-${index}`}
        style={{ height: '100%', width: '100%', backgroundColor: accent, transformOrigin: 'left', transform: [{ scaleX: scale }] }}
      />
    </View>
  )
}

/** One segment per exercise, each filled by its share of completed sets; the one being worked
 *  has a tinted track. Decorative: the clock's "4/15 sets" and the heading's "2/5" say it in words. */
export function ProgressSegments({ values, keys, current }: {
  values: number[]
  /** One stable key per exercise (occurrenceKeys), so a segment moves with its exercise. */
  keys: string[]
  current: number
}) {
  return (
    <View
      testID="gym-progress-line"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row gap-[3px] px-3 pb-0.5"
    >
      {values.map((v, i) => <Segment key={keys[i] ?? i} index={i} value={v} current={i === current} />)}
    </View>
  )
}
