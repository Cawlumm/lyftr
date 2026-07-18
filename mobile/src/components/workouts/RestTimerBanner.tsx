import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, Pause, Play, SkipForward } from 'lucide-react-native'
import { useWorkoutSession } from '../../lib/lyftr'
import { useRestTimer } from '../../hooks/useRestTimer'
import { fmtClock, nextIncompleteSet } from '../../utils/workoutSets'
import { AppText, IconButton } from '../ui'
import { useTheme } from '../../theme/useTheme'

// Port of web/components/RestTimerBanner.tsx, styled as a full-width bottom sheet
// (matches the ConfirmSheet/ActionSheet visual language: rounded-top, grabber,
// elevated surface — but NOT the Sheet modal, since a rest timer must stay persistent
// and non-dimming). A draining line, a big optically-centred countdown with pause/
// resume, and full-width −15/+15/Skip actions (Done when finished). DOCKED in-flow at
// the bottom of the gym set screen; FLOATING (bottom-anchored) over the overview/info
// screens. When minimized the countdown moves to the session-pill chip instead.
export function RestTimerBanner({ docked = false }: { docked?: boolean }) {
  const { colors, brand } = useTheme()
  const insets = useSafeAreaInsets()
  const restDurationSec = useWorkoutSession((s) => s.restDurationSec)
  const restExIdx = useWorkoutSession((s) => s.restExIdx)
  const restSetIdx = useWorkoutSession((s) => s.restSetIdx)
  const restEndsAt = useWorkoutSession((s) => s.restEndsAt)
  const restPausedRemainingMs = useWorkoutSession((s) => s.restPausedRemainingMs)
  const session = useWorkoutSession((s) => s.session)
  const adjustRest = useWorkoutSession((s) => s.adjustRest)
  const clearRest = useWorkoutSession((s) => s.clearRest)
  const pauseRest = useWorkoutSession((s) => s.pauseRest)
  const resumeRest = useWorkoutSession((s) => s.resumeRest)
  const { active, paused, done, left } = useRestTimer()

  // Smooth drain line: instead of stepping the width off the whole-second countdown
  // (which jumps every JS tick), animate a shared value from the current fraction → 0 on
  // the UI thread over the exact remaining ms (linear). Driven off the absolute end time
  // so it re-syncs on any restart/adjust and doesn't depend on the ~300ms JS tick.
  const drain = useSharedValue(100)
  useEffect(() => {
    cancelAnimation(drain)
    if (!restDurationSec || restDurationSec <= 0) return
    if (done) { drain.value = 0; return }
    if (paused && restPausedRemainingMs != null) {
      drain.value = Math.min(100, (restPausedRemainingMs / 1000 / restDurationSec) * 100)
      return
    }
    if (restEndsAt != null) {
      const remMs = Math.max(0, restEndsAt - Date.now())
      drain.value = Math.min(100, (remMs / 1000 / restDurationSec) * 100)
      drain.value = withTiming(0, { duration: remMs, easing: Easing.linear })
    }
  }, [restEndsAt, restPausedRemainingMs, done, paused, restDurationSec])
  const drainStyle = useAnimatedStyle(() => ({ width: `${drain.value}%` }))

  // A short celebratory pulse the moment rest hits zero (paired with the haptic in
  // WorkoutSessionLayer). Runs on the check chip; reset whenever rest isn't done.
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (done) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.14, { duration: 240, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 240, easing: Easing.in(Easing.quad) }),
        ), 3, false,
      )
    } else {
      cancelAnimation(pulse)
      pulse.value = 1
    }
  }, [done])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  // Hidden when no rest is running or paused (auto-dismiss lives in useRestTimer).
  if (!active) return null

  // Set ↔ timer linkage (Hevy-style): label the panel with the just-completed set +
  // the next incomplete one (mirrors gym-mode's auto-advance).
  const restEx = restExIdx != null ? session?.exercises[restExIdx] : undefined
  const nextIdx = restEx != null && restSetIdx != null ? nextIncompleteSet(restEx.sets, restSetIdx) : -1
  const doneSetNum = restEx != null && restSetIdx != null ? restSetIdx + 1 : null
  const label =
    doneSetNum == null
      ? done ? 'Rest over' : paused ? 'Paused' : 'Rest'
      : done
        ? nextIdx !== -1 ? `Rest over · set ${nextIdx + 1} next` : 'Rest over'
        : paused
          ? `Set ${doneSetNum} done · paused`
          : nextIdx !== -1
            ? `Set ${doneSetNum} done · set ${nextIdx + 1} next`
            : `Set ${doneSetNum} done · resting`

  // Urgency cue: the last 10 running seconds shift the drain + countdown to amber
  // (paused doesn't count down, so it never goes hot). Time-based (not fraction-based)
  // so it means the same "≈10s left" regardless of the total rest length.
  const urgent = !paused && !done && left <= 10
  const drainColor = urgent ? brand.warning : brand.cyan
  const numColor = urgent ? brand.warning : colors.txPrimary

  const secBtn = 'flex-1 items-center justify-center py-3.5 rounded-2xl bg-surface-muted border border-surface-border active:scale-95'
  const brandBtn = 'flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-brand-500 active:scale-95'

  const panel = (
    <View className="overflow-hidden rounded-t-3xl border-t border-surface-border bg-surface-raised shadow-lg">
      {/* Grabber — the shared sheet cue. */}
      <View className="mx-auto mb-2 mt-2.5 h-1 w-10 rounded-full bg-surface-muted" />
      {/* Draining progress line (thicker than a hairline so the drain reads at a glance;
          amber in the final seconds, a solid success bar once rest is over). */}
      {done ? (
        <View className="h-1.5 bg-success-500" />
      ) : (
        <View className="h-1.5 bg-surface-muted">
          <Animated.View className="h-full rounded-r-full" style={[drainStyle, { backgroundColor: drainColor }]} />
        </View>
      )}
      {/* The sheet surface reaches the physical bottom edge; only its content is inset
          by the safe area (home indicator) — no dead band below the actions. */}
      <View className="px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <AppText variant="caption" color="muted" className="text-center">{label}</AppText>
        {done ? (
          // Done confirmation: a compact, celebratory stack — pulsing success check over
          // a single full-width Done button. (NB: the button must NOT reuse brandBtn's
          // `flex-1`; as a lone column child, flex-1 collapses its height on native into
          // a thin sliver. It gets its own full-width class with a real py instead.)
          <View className="mt-3 items-center gap-3">
            <Animated.View style={pulseStyle} className="h-12 w-12 items-center justify-center rounded-full bg-success-500/15">
              <Check size={26} color={brand.success} />
            </Animated.View>
            <Pressable onPress={() => clearRest()} className="w-full items-center justify-center rounded-2xl bg-brand-500 py-4 active:scale-95">
              <Text className="font-sans-bold text-base text-white">Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Hero row: pause/resume in a fixed-width column on the left with a matching
                spacer on the right, so the big countdown stays optically centred. */}
            <View className="my-3 flex-row items-center">
              <View className="w-14 items-center">
                <IconButton
                  icon={paused ? Play : Pause}
                  label={paused ? 'Resume rest timer' : 'Pause rest timer'}
                  variant="brand"
                  size="lg"
                  onPress={paused ? resumeRest : pauseRest}
                />
              </View>
              <Text className="flex-1 text-center font-display text-6xl" style={{ color: numColor, fontVariant: ['tabular-nums'] }}>
                {fmtClock(left)}
              </Text>
              <View className="w-14" />
            </View>
            <View className="flex-row gap-2.5">
              <Pressable onPress={() => adjustRest(-15)} accessibilityLabel="Shorten rest by 15 seconds" className={secBtn}>
                <Text className="font-sans-bold text-base text-tx-secondary" style={{ fontVariant: ['tabular-nums'] }}>−15</Text>
              </Pressable>
              <Pressable onPress={() => adjustRest(15)} accessibilityLabel="Extend rest by 15 seconds" className={secBtn}>
                <Text className="font-sans-bold text-base text-tx-secondary" style={{ fontVariant: ['tabular-nums'] }}>+15</Text>
              </Pressable>
              <Pressable onPress={() => clearRest()} className={brandBtn}>
                <SkipForward size={18} color="#ffffff" />
                <Text className="font-sans-bold text-base text-white">Skip</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  )

  // Docked: in-flow last child of the set screen (pushes content up). Floating: anchored
  // to the very bottom over the overview/info screens. Both span the full width.
  if (docked) return <View className="flex-shrink-0">{panel}</View>
  return <View className="absolute bottom-0 left-0 right-0 z-50">{panel}</View>
}
