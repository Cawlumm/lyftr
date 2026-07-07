import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { format, parseISO, subDays } from 'date-fns'
import * as Haptics from 'expo-haptics'
import {
  Activity, AlertCircle, ArrowDown, ArrowUp, Calendar, ChevronRight, Minus, Scale, Sunrise,
  TrendingDown, TrendingUp, X,
} from 'lucide-react-native'
import {
  apiErrorMessage, dayToIsoNoon, displayToLbs, displayWeight, isoToDayInput, maxWeight, todayStr,
  weightError, weightShort, type WeightLog, type WeightStats,
} from '@lyftr/shared'
import {
  AppText, Button, Card, DateInput, Field, Label, Loading, NumberField, NumericKeyboardAccessory,
  NUMERIC_ACCESSORY_ID, PageHeader, Screen, SegmentedControl, StepperTile,
} from '../../../src/components/ui'
import { ExerciseHistoryChart, type ChartPoint } from '../../../src/components/workouts/ExerciseHistoryChart'
import { useServerInfiniteList } from '../../../src/hooks/useServerInfiniteList'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { clampStep } from '../../../src/utils/number'
import { useTheme } from '../../../src/theme/useTheme'

const PERIODS = ['7d', '30d', '90d', 'All'] as const
type Period = typeof PERIODS[number]
const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, 'All': null }
const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p, label: p }))

export default function Weight() {
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const unit = settings.weight_unit
  const wUnit = weightShort(unit)
  const { colors, accent, brand } = useTheme()

  const [period, setPeriod] = useState<Period>('30d')
  const [stats, setStats] = useState<WeightStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Paginated history list (newest-first) — the FlatList data.
  const fetcher = useCallback((offset: number, limit: number) => client.weightAPI.list({ offset, limit }), [])
  const { items, loadMore, hasMore, loading, initialLoading, reload } =
    useServerInfiniteList<WeightLog>({ fetcher })

  // Chart data — a separate period-scoped fetch (uncapped at 1000), re-fetched when the
  // period changes and after every successful log.
  const [chartLogs, setChartLogs] = useState<WeightLog[]>([])
  // Returns the fetch promise so pull-to-refresh can await a full refresh.
  const refetchChart = useCallback(() => {
    const days = PERIOD_DAYS[period]
    const from = days != null ? format(subDays(new Date(), days), 'yyyy-MM-dd') : undefined
    return client.weightAPI.list({ limit: 1000, from }).then((data) => setChartLogs(data || [])).catch(() => {})
  }, [period])
  useEffect(() => { refetchChart() }, [refetchChart])

  const refetchStats = useCallback(() => client.weightAPI.stats().then(setStats).catch(() => {}), [])
  useEffect(() => {
    fetchSettings()
    refetchStats()
  }, [fetchSettings, refetchStats])

  // Pull-to-refresh: drive the native RefreshControl spinner off a full refresh of all
  // three sources (history list + stats + chart), same affordance as the Workouts list.
  const [pulling, setPulling] = useState(false)
  const onPullRefresh = useCallback(async () => {
    setPulling(true)
    await Promise.all([reload(), refetchStats(), refetchChart()])
    setPulling(false)
  }, [reload, refetchStats, refetchChart])

  // Log form
  const [newWeight, setNewWeight] = useState('')
  const [newDate, setNewDate] = useState(todayStr())
  const [newNotes, setNewNotes] = useState('')
  const [logging, setLogging] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const duplicateWarningDismissedRef = useRef(false)

  // Prefill the input once with the latest entry's weight (so re-logging a similar value
  // is a one-tap edit). Fires only after the first page lands.
  const prefillDoneRef = useRef(false)
  useEffect(() => {
    if (!prefillDoneRef.current && items.length > 0) {
      setNewWeight(String(displayWeight(items[0].weight, unit)))
      prefillDoneRef.current = true
    }
  }, [items, unit])

  // The list is kept mounted under the detail screen, so an edit/delete there doesn't
  // remount us — refetch everything on re-focus instead. Skip the first focus: the
  // hooks/effects above already fetched.
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true
        return
      }
      reload()
      refetchStats()
      refetchChart()
    }, [reload, refetchStats, refetchChart])
  )

  // Oldest → newest for the chart. Weight in the display unit; `sub` feeds the tap bubble.
  const chartData: ChartPoint[] = useMemo(
    () =>
      [...chartLogs].reverse().map((l) => {
        const d = parseISO(l.logged_at)
        return { date: format(d, 'M/d'), weight: displayWeight(l.weight, unit), sub: format(d, 'MMM d, yyyy') }
      }),
    [chartLogs, unit]
  )
  const [chartWidth, setChartWidth] = useState(0)

  const handleLog = async () => {
    if (logging) return
    const w = parseFloat(newWeight)
    const wErr = weightError(w, unit)
    if (wErr) {
      setError(wErr)
      return
    }

    // Guard against a same-day double-log (unless already waved through).
    if (!duplicateWarningDismissedRef.current && items.length > 0 && isoToDayInput(items[0].logged_at) === newDate) {
      setShowDuplicateWarning(true)
      return
    }

    setLogging(true)
    setError(null)
    setShowDuplicateWarning(false)

    try {
      const real = await client.weightAPI.log({
        weight: displayToLbs(w, unit),
        notes: newNotes.trim(),
        logged_at: dayToIsoNoon(newDate),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setNewWeight(String(displayWeight(real.weight, unit)))
      setNewNotes('')
      setNewDate(todayStr())
      setShowNotes(false)
      duplicateWarningDismissedRef.current = false
      reload()
      refetchStats()
      refetchChart()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to log weight'))
    } finally {
      setLogging(false)
    }
  }

  if (initialLoading) return <Loading />

  // Period stats computed from chartLogs (period-scoped server fetch). For "All" prefer
  // the server-computed aggregate since it isn't capped at 1000.
  const periodValues = chartLogs.map((l) => l.weight) // raw lbs from DB, newest first
  const useServerAggregate = period === 'All' && stats != null
  const currentLbs = periodValues[0] ?? stats?.latest ?? 0
  const oldestLbs = periodValues[periodValues.length - 1] ?? stats?.starting ?? 0
  const changeLbs = currentLbs - oldestLbs
  const avgLbs = useServerAggregate
    ? stats!.avg ?? 0
    : periodValues.length > 0
      ? periodValues.reduce((a, b) => a + b, 0) / periodValues.length
      : 0
  const minLbs = useServerAggregate ? stats!.min ?? 0 : periodValues.length > 0 ? Math.min(...periodValues) : 0
  const maxLbs = useServerAggregate ? stats!.max ?? 0 : periodValues.length > 0 ? Math.max(...periodValues) : 0

  const current = displayWeight(currentLbs, unit)
  const change = displayWeight(changeLbs, unit)
  const avg = displayWeight(avgLbs, unit)
  const min = displayWeight(minLbs, unit)
  const max = displayWeight(maxLbs, unit)

  const TrendIcon = change === 0 ? Minus : change < 0 ? TrendingDown : TrendingUp
  // Weight loss is framed positive (green); gain negative (red); flat is muted.
  const trendPill =
    change === 0
      ? 'bg-surface-muted border-surface-border'
      : change < 0
        ? 'bg-success-500/10 border-success-500/20'
        : 'bg-error-500/10 border-error-500/20'
  const trendText = change === 0 ? colors.txMuted : change < 0 ? brand.successSoft : brand.errorSoft
  const changeWord = change === 0 ? 'no change' : change < 0 ? 'lost' : 'gained'

  const statCards = [
    { label: 'Avg', value: avg, icon: Activity, color: accent },
    { label: 'Low', value: min, icon: ArrowDown, color: brand.successSoft },
    { label: 'High', value: max, icon: ArrowUp, color: brand.errorSoft },
  ]

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(l) => String(l.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={accent} colors={[accent]} />
        }
        ListHeaderComponent={
          <View className="gap-5 py-4">
            <PageHeader
              title="Weight"
              subtitle="Track your body weight over time"
              action={
                <View className="flex-row items-center gap-1.5 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1">
                  <Calendar size={12} color={accent} />
                  <AppText variant="caption" color="brand">{wUnit}</AppText>
                </View>
              }
            />

            {error ? (
              <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
                <AlertCircle size={18} color={brand.errorSoft} />
                <Text className="flex-1 font-sans text-sm text-error-400">{error}</Text>
              </View>
            ) : null}

            {/* Quick log — kept at the top so entry is reachable on first paint. */}
            <Card>
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Scale size={16} color={accent} />
                  <AppText variant="bodySemibold">Log Weight</AppText>
                </View>
                {items.length > 0 ? (
                  <AppText variant="caption" color="muted">
                    last: {displayWeight(items[0].weight, unit)} {wUnit}
                  </AppText>
                ) : null}
              </View>

              <View className="gap-3">
                <StepperTile
                  icon={Scale}
                  label={`Weight (${wUnit})`}
                  name="weight"
                  step={0.5}
                  onStep={(d) => setNewWeight(String(clampStep(parseFloat(newWeight) || 0, d, { min: 0, max: maxWeight(unit) })))}
                >
                  <NumberField
                    inputMode="decimal"
                    value={newWeight}
                    onChange={setNewWeight}
                    placeholder="0"
                    accessibilityLabel="Weight"
                    inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  />
                </StepperTile>

                {showNotes ? (
                  <View className="gap-2 rounded-xl border border-surface-border bg-surface-overlay p-3">
                    <View className="mb-1 flex-row items-center justify-between">
                      <AppText variant="caption" color="secondary">Date & note</AppText>
                      <Pressable onPress={() => setShowNotes(false)} hitSlop={8} className="p-1 active:opacity-60" accessibilityLabel="Collapse">
                        <X size={14} color={colors.txMuted} />
                      </Pressable>
                    </View>
                    <DateInput value={newDate} onChange={setNewDate} maximumDate={new Date()} />
                    <Field
                      value={newNotes}
                      onChangeText={setNewNotes}
                      placeholder="Note — e.g. morning, post-run"
                      maxLength={200}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowNotes(true)}
                    className="h-11 flex-row items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-overlay active:scale-[0.99]"
                  >
                    <Calendar size={16} color={colors.txMuted} />
                    <AppText variant="body" color="secondary">Add date & note</AppText>
                  </Pressable>
                )}

                {showDuplicateWarning && items.length > 0 ? (
                  <View className="flex-row items-start gap-3 rounded-xl border border-warning-500/20 bg-warning-500/10 px-4 py-3">
                    <AlertCircle size={16} color={brand.warningSoft} style={{ marginTop: 2 }} />
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-sm text-warning-400">
                        Already logged on {format(parseISO(items[0].logged_at), 'MMM d')} ({displayWeight(items[0].weight, unit)} {wUnit}). Log again anyway?
                      </Text>
                      <View className="mt-2 flex-row gap-2">
                        <Pressable
                          onPress={() => setShowDuplicateWarning(false)}
                          className="rounded-lg border border-surface-border bg-surface-overlay px-3 py-1 active:opacity-70"
                        >
                          <AppText variant="caption" color="secondary">Cancel</AppText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            duplicateWarningDismissedRef.current = true
                            setShowDuplicateWarning(false)
                            handleLog()
                          }}
                          className="rounded-lg border border-warning-500/30 bg-warning-500/20 px-3 py-1 active:opacity-70"
                        >
                          <Text className="font-sans-semibold text-xs text-warning-400">Log Anyway</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}

                <Button
                  title={logging ? 'Logging…' : 'Log Weight'}
                  onPress={handleLog}
                  loading={logging}
                  disabled={!(parseFloat(newWeight) > 0) || logging}
                />
                <View className="flex-row items-center justify-center gap-1.5">
                  <Sunrise size={14} color={brand.warningSoft} />
                  <AppText variant="caption" color="muted">Best logged in the morning, after the bathroom</AppText>
                </View>
              </View>
            </Card>

            {/* Current-weight hero */}
            <Card className="border-brand-500/20 bg-brand-500/5">
              {items.length === 0 ? (
                <View className="items-center py-2">
                  <Label className="mb-1">Current Weight</Label>
                  <AppText variant="body" color="muted">The scale doesn't know you exist yet. Fix that.</AppText>
                </View>
              ) : (
                <>
                  <View className="flex-row items-start justify-between">
                    <View>
                      <Label className="mb-2">Current Weight</Label>
                      <View className="flex-row items-end gap-2">
                        <AppText variant="display" style={{ fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] }}>{current}</AppText>
                        <AppText variant="body" color="muted" className="mb-1.5">{wUnit}</AppText>
                      </View>
                    </View>
                    <View className={`flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 ${trendPill}`}>
                      <TrendIcon size={16} color={trendText} />
                      <Text className="font-sans-semibold text-sm" style={{ color: trendText, fontVariant: ['tabular-nums'] }}>
                        {Math.abs(change)} {wUnit}
                      </Text>
                    </View>
                  </View>
                  <AppText variant="caption" color="muted" className="mt-3">
                    {Math.abs(change)} {wUnit} {changeWord} over {period}
                  </AppText>
                </>
              )}
            </Card>

            {/* Stats row */}
            <View className="flex-row gap-3">
              {statCards.map((s) => (
                <Card key={s.label} className="flex-1" style={{ paddingHorizontal: 12 }}>
                  <View className="mb-2 flex-row items-center gap-1.5">
                    <s.icon size={14} color={s.color} />
                    <Label numberOfLines={1}>{s.label}</Label>
                  </View>
                  <View className="flex-row items-end gap-1">
                    <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(s.value)}</AppText>
                    <AppText variant="caption" color="muted" className="mb-0.5">{wUnit}</AppText>
                  </View>
                </Card>
              ))}
            </View>

            {/* Chart + period selector */}
            <Card>
              <View className="mb-3 flex-row items-center justify-between gap-2">
                <AppText variant="bodySemibold">Trend</AppText>
                <View className="flex-1 max-w-[220px]">
                  <SegmentedControl size="sm" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
                </View>
              </View>
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                {chartData.length === 0 ? (
                  <View className="h-44 items-center justify-center">
                    <AppText variant="body" color="muted">No data for this period</AppText>
                  </View>
                ) : chartData.length === 1 ? (
                  <View className="h-44 items-center justify-center">
                    <AppText variant="body" color="muted">Log another entry to see the trend</AppText>
                  </View>
                ) : (
                  <ExerciseHistoryChart data={chartData} width={chartWidth} unit={wUnit} readoutNote="" height={180} />
                )}
              </View>
            </Card>

            {items.length > 0 ? <Label className="px-1">History</Label> : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const next = items[index + 1]
          const deltaLbs = next ? item.weight - next.weight : 0
          const displayW = displayWeight(item.weight, unit)
          const displayDelta = displayWeight(Math.abs(deltaLbs), unit)
          return (
            <Pressable
              onPress={() => router.push(`/weight/${item.id}`)}
              className="mb-2 flex-row items-center gap-3 rounded-2xl border border-surface-border bg-surface-raised p-4 active:scale-[0.99]"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                <Scale size={20} color={accent} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-sans-semibold text-sm text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>
                  {Math.round(displayW)} {wUnit}
                </Text>
                <AppText variant="caption" color="muted" className="mt-0.5">
                  {format(parseISO(item.logged_at), 'MMM d, yyyy')}
                </AppText>
                {deltaLbs !== 0 || item.notes ? (
                  <View className="mt-0.5 flex-row items-center gap-x-2 overflow-hidden">
                    {deltaLbs !== 0 ? (
                      <View className="flex-row items-center gap-0.5">
                        {deltaLbs < 0 ? (
                          <TrendingDown size={12} color={brand.successSoft} />
                        ) : (
                          <TrendingUp size={12} color={brand.errorSoft} />
                        )}
                        <Text
                          className="font-sans-medium text-xs"
                          style={{ color: deltaLbs < 0 ? brand.successSoft : brand.errorSoft, fontVariant: ['tabular-nums'] }}
                        >
                          {Math.round(displayDelta)}
                        </Text>
                      </View>
                    ) : null}
                    {deltaLbs !== 0 && item.notes ? <AppText variant="caption" color="muted">·</AppText> : null}
                    {item.notes ? (
                      <AppText variant="caption" color="muted" numberOfLines={1} className="flex-1">{item.notes}</AppText>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <ChevronRight size={16} color={colors.txMuted} />
            </Pressable>
          )
        }}
        ListFooterComponent={
          hasMore && loading && items.length > 0 ? (
            <View className="items-center py-3">
              <ActivityIndicator size="small" color={accent} />
            </View>
          ) : null
        }
      />
      {/* iOS Done bar above the numeric keyboard (the weight NumberField links it). */}
      <NumericKeyboardAccessory />
    </Screen>
  )
}
