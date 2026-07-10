import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { format, subDays } from 'date-fns'
import { ArrowLeft, Dumbbell, Trophy } from 'lucide-react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import {
  displayWeight,
  weightShort,
  type Exercise,
  type ExerciseHistoryPoint,
  type PersonalRecord,
} from '@lyftr/shared'
import { AppText, Screen, SegmentedControl } from '../ui'
import { MuscleDiagram } from './MuscleDiagram'
import { ExerciseHistoryChart, type ChartPoint } from './ExerciseHistoryChart'
import { client, useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { useTheme } from '../../theme/useTheme'
import { muscleColor, EQUIPMENT_LABEL } from '../../utils/exerciseUtils'

// 1:1 port of web/src/pages/ExerciseDetail.tsx. Read-only exercise reference: identity +
// muscles worked (front/back diagram), image, equipment/category tags, secondary muscles,
// personal record, weight-progression history chart, and instructions. All data/query/
// calculation logic is carried over unchanged; presentation is authored against the RN ui
// kit.
//
// This is the SHARED screen body: it's mounted by a thin route in every tab stack that
// links to an exercise (workouts/exercise/[id] + programs/exercise/[id]). Duplicating the
// route per stack (rather than one route in the workouts stack) is what keeps back working
// — pushing a workouts-tab route from the programs tab jumps tabs and strands the back
// stack. `backFallback` is where a deep-link with no history returns to (its own tab root).

const HISTORY_PERIODS = ['1m', '3m', '6m', 'All'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]
const HISTORY_DAYS: Record<HistoryPeriod, number | null> = { '1m': 30, '3m': 90, '6m': 180, 'All': null }
const PERIOD_OPTIONS = HISTORY_PERIODS.map((p) => ({ value: p, label: p }))

// Header muscle badge (web muscleColorBordered) + borderless variant for "Also works"
// (web muscleColor). px-2 py-0.5 rounded, matching the web spans.
function MuscleBadge({ muscle, bordered }: { muscle: string; bordered?: boolean }) {
  const { colors } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View
      className={`rounded px-2 py-0.5 ${tint?.chip ?? 'bg-surface-muted'} ${
        bordered ? `border ${tint?.border ?? 'border-surface-border'}` : ''
      }`}
    >
      {/* Tint via inline style — see exerciseUtils.ts for why not a className. */}
      <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>
        {muscle}
      </AppText>
    </View>
  )
}

// Web's loading state: a centered pulsing Dumbbell (animate-pulse). Reanimated opacity
// loop is the RN analog (CSS keyframes have no RN equivalent).
function LoadingPulse() {
  const { brand } = useTheme()
  const o = useSharedValue(1)
  useEffect(() => {
    o.value = withRepeat(withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true)
    return () => cancelAnimation(o)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Screen>
      <View className="items-center justify-center py-20">
        <Animated.View style={style}>
          <Dumbbell size={24} color={brand.cyan} />
        </Animated.View>
      </View>
    </Screen>
  )
}

export function ExerciseDetailScreen({ backFallback }: { backFallback: Href }) {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  const session = useWorkoutSession((s) => s.session)
  const settings = useSettingsStore((s) => s.settings)
  const { colors, brand, accent } = useTheme()
  const wUnit = weightShort(settings.weight_unit)

  // Deep links can land here with no history — fall back to the originating tab's root.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(backFallback))

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [pr, setPR] = useState<PersonalRecord | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryPoint[]>([])
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('3m')
  const [imgFailed, setImgFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    const id = Number(exerciseId)
    if (!id) { goBack(); return }

    const fromSession = session?.exercises.find((e) => e.exercise_id === id)?.exercise
    const exercisePromise = fromSession ? Promise.resolve(fromSession) : client.exerciseAPI.get(id)

    let cancelled = false
    Promise.all([
      exercisePromise,
      client.exerciseAPI.getPRs(id).catch(() => null),
      client.exerciseAPI.getHistory(id, 50).catch(() => []),
    ])
      .then(([ex, prData, histData]) => {
        if (cancelled) return
        setExercise(ex)
        setPR(prData)
        setHistory(histData || [])
      })
      .catch(() => { if (!cancelled) goBack() })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  const filteredHistory = useMemo(() => {
    const days = HISTORY_DAYS[historyPeriod]
    if (days == null) return history
    const cutoff = subDays(new Date(), days).getTime()
    return history.filter((h) => new Date(h.date).getTime() >= cutoff)
  }, [history, historyPeriod])

  if (loading || !exercise) return <LoadingPulse />

  const equipLabel = EQUIPMENT_LABEL[exercise.equipment?.toLowerCase()] || exercise.equipment
  const descLines = exercise.description ? exercise.description.split('\n').filter((l) => l.trim()) : []
  const chartData: ChartPoint[] = [...filteredHistory].reverse().map((h) => ({
    date: format(new Date(h.date), 'M/d'),
    weight: displayWeight(h.max_weight, wUnit),
  }))

  const hasImage = !!exercise.image_url && !imgFailed

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero image — full-bleed, with an overlaid back button (mirrors the gym
            exercise-info treatment). Falls back to a plain back row when there's no photo. */}
        {hasImage ? (
          <View>
            <Image
              source={{ uri: exercise.image_url }}
              onError={() => setImgFailed(true)}
              resizeMode="cover"
              className="h-64 w-full bg-surface-muted"
            />
            {/* Top scrim so the white back chevron reads on any photo. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96 }}
              pointerEvents="none"
            />
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="absolute left-4 top-3 h-9 w-9 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
            >
              <ArrowLeft size={20} color="#ffffff" />
            </Pressable>
          </View>
        ) : null}

        <View className="gap-5 px-5 py-4">
          {/* Back row only when there's no hero image to host the button. */}
          {!hasImage ? (
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="-ml-2 h-9 w-9 items-center justify-center rounded-lg active:bg-surface-muted"
            >
              <ArrowLeft size={20} color={colors.txMuted} />
            </Pressable>
          ) : null}

          {/* Title + identity badges (muscle group + equipment + category, grouped). */}
          <View>
            <AppText variant="title">{exercise.name}</AppText>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <MuscleBadge muscle={exercise.muscle_group} bordered />
              {equipLabel && exercise.equipment !== 'other' ? (
                <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1">
                  <AppText variant="caption" color="secondary">{equipLabel}</AppText>
                </View>
              ) : null}
              {exercise.category ? (
                <View className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1">
                  <AppText variant="caption" className="capitalize" style={{ color: accent }}>{exercise.category}</AppText>
                </View>
              ) : null}
            </View>
          </View>

          {/* Muscles worked */}
          <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
            <AppText variant="label" color="muted" className="mb-3 uppercase">Muscles Worked</AppText>
            <MuscleDiagram exercise={exercise} />
          </View>

          {/* Secondary muscles */}
          {exercise.secondary_muscles?.length > 0 ? (
            <View>
              <AppText variant="label" color="muted" className="mb-2 uppercase">Also works</AppText>
              <View className="flex-row flex-wrap gap-1.5">
                {exercise.secondary_muscles.map((m) => <MuscleBadge key={m} muscle={m} />)}
              </View>
            </View>
          ) : null}

          {/* Personal record — gold "achievement" treatment: tinted card + trophy chip,
              a hero weight, and a divided Est. 1RM footer. */}
          {pr && pr.weight > 0 ? (
            <View className="rounded-2xl border border-warning-500/25 bg-warning-500/[0.06] p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-warning-500/15">
                    <Trophy size={15} color={brand.warningSoft} />
                  </View>
                  <AppText variant="label" color="muted" className="uppercase">Personal Best</AppText>
                </View>
                <AppText variant="caption" color="muted">{format(new Date(pr.date), 'MMM d, yyyy')}</AppText>
              </View>

              <View className="mt-3 flex-row items-end gap-2">
                <Text className="font-display text-3xl text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>
                  {displayWeight(pr.weight, wUnit)}
                </Text>
                <AppText variant="body" color="muted" className="mb-1">{wUnit} × {pr.reps} reps</AppText>
              </View>

              <View className="mt-3 flex-row items-center justify-between border-t border-warning-500/15 pt-3">
                <AppText variant="caption" color="muted">Estimated 1RM</AppText>
                <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>
                  {displayWeight(pr.estimated_1rm, wUnit)} {wUnit}
                </AppText>
              </View>
            </View>
          ) : null}

          {/* History chart */}
          {history.length >= 2 ? (
            <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              {/* Label + period selector STACKED: the 4-option control + label don't fit
                  on one row at real device widths (overflowed/clipped the card). */}
              <AppText variant="label" color="muted" className="mb-3 uppercase">Weight Progression</AppText>
              <SegmentedControl size="sm" className="mb-3" options={PERIOD_OPTIONS} value={historyPeriod} onChange={setHistoryPeriod} />
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                {chartData.length < 2 ? (
                  <View className="h-[110px] items-center justify-center">
                    <AppText variant="body" color="muted">No data for this period</AppText>
                  </View>
                ) : (
                  <ExerciseHistoryChart data={chartData} width={chartWidth} unit={wUnit} />
                )}
              </View>
            </View>
          ) : null}

          {/* Instructions */}
          {descLines.length > 0 ? (
            <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <AppText variant="label" color="muted" className="mb-3 uppercase">Instructions</AppText>
              <View className="gap-2.5">
                {descLines.map((line, i) => {
                  const m = line.match(/^(\d+\.)\s*(.*)/)
                  return (
                    <AppText key={i} variant="body" color="secondary">
                      {m ? <AppText variant="bodySemibold" color="primary">{m[1]} </AppText> : null}
                      {m ? m[2] : line}
                    </AppText>
                  )
                })}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
