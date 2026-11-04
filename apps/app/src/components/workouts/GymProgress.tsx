import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { ChevronDown } from '../ui/icons'
import { interactive } from '../ui/interaction'
import { useMotion } from '../../lib/useMotion'
import { useTheme } from '../../theme/useTheme'

// Below this much room the chip shows only the position: a name cut to two letters says less
// than none, and the bar's other controls keep their size either way.
export const CHIP_NAME_MIN_WIDTH = 120

/** Where you are in the workout, and the way to the exercises sheet. It takes whatever width
 *  the top bar leaves between Back and Finish, and shows the exercise's name only when that
 *  room is enough to read some of it. */
export function ProgressChip({ current, total, name, onPress }: {
  /** 1-based position of the exercise being worked. */
  current: number
  total: number
  name: string
  onPress: () => void
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [room, setRoom] = useState(0)
  const showName = room >= CHIP_NAME_MIN_WIDTH
  return (
    <View testID="gym-progress-slot" className="min-w-0 flex-1 flex-row" onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
      <Pressable
        testID="gym-progress-chip"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('gym.exercises.chip', { current, total, name })}
        className={`h-11 min-w-0 max-w-full flex-row items-center gap-1 rounded-xl border border-surface-border bg-surface-muted pl-3 pr-2 active:scale-95 ${interactive('hover:bg-surface-border')}`}
      >
        <Text className="font-sans-semibold text-xs text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>{`${current}/${total}`}</Text>
        {showName ? (
          <Text numberOfLines={1} className="min-w-0 flex-shrink font-sans-semibold text-xs text-tx-secondary">{`· ${name}`}</Text>
        ) : null}
        <ChevronDown size={14} color={colors.txMuted} />
      </Pressable>
    </View>
  )
}

/** A thin bar under the top bar: completed sets over all sets. Decorative; the chip and the
 *  exercises sheet say the same in words. Grows by transform, so nothing re-lays out. */
export function ProgressLine({ value }: { value: number }) {
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
      testID="gym-progress-line"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-[3px] w-full overflow-hidden bg-surface-border"
    >
      <Animated.View
        testID="gym-progress-fill"
        style={{ height: '100%', width: '100%', backgroundColor: accent, transformOrigin: 'left', transform: [{ scaleX: scale }] }}
      />
    </View>
  )
}
