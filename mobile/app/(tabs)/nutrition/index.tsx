import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { format, subDays, addDays } from 'date-fns'
import {
  AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Flame, Plus, Trash2, Utensils,
} from 'lucide-react-native'
import { todayStr, type DailyStats, type FoodLog } from '@lyftr/shared'
import {
  AppText, Card, ConfirmSheet, DateInput, IconButton, PageHeader, Screen, SectionHeader,
  SegmentedControl, Toast, deleteConfirmProps,
} from '../../../src/components/ui'
import { MacroRing, MacroHistoryChart, type MacroHistoryPoint } from '../../../src/components/nutrition/NutritionCharts'
import { NutritionSkeleton } from '../../../src/components/nutrition/NutritionSkeleton'
import {
  MACRO_COLORS, MACRO_TEXT, MEALS, MEAL_COLORS, MEAL_ICONS, MEAL_LABELS, type Meal,
} from '../../../src/components/nutrition/nutritionMeta'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

const HISTORY_PERIODS = ['7d', '30d', '90d'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]
const HISTORY_OPTIONS = HISTORY_PERIODS.map((p) => ({ value: p, label: p }))

// Port of web/pages/Food.tsx — the daily Nutrition dashboard, mobile-polished: date
// navigator + haptics, calorie hero + macro rings, four meal cards with entries whose
// delete routes through the native ConfirmSheet (not web's inline row), the macro-
// history chart, and a success Toast on arrival back from a log. Calorie/macro targets
// come from the settings store (the mobile equivalent of web's userAPI.getSettings).
const hSelect = () => Haptics.selectionAsync().catch(() => {})

export default function Nutrition() {
  const { colors, brand, accent, isDark } = useTheme()
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  // One-shot courier from the log flow: ?logged=<meal label> | 'Updated' → success toast.
  const params = useLocalSearchParams<{ logged?: string }>()
  const [toast, setToast] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d')
  const [historyData, setHistoryData] = useState<MacroHistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [chartWidth, setChartWidth] = useState(0)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmEntry, setConfirmEntry] = useState<FoodLog | null>(null)
  const [pulling, setPulling] = useState(false)
  const hasLoadedRef = useRef(false)

  const loadDay = useCallback(async (date: string) => {
    setLogs([])
    setStats(null)
    setError(null)
    try {
      const defaultStats: DailyStats = {
        date, total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, total_fiber: 0, workout_count: 0,
      }
      const [logData, statsData] = await Promise.all([
        client.foodAPI.list(date),
        client.foodAPI.stats(date).catch(() => defaultStats),
      ])
      setLogs(logData || [])
      setStats(statsData)
    } catch (err: any) {
      setError(err?.message || 'Failed to load food data')
    } finally {
      hasLoadedRef.current = true
    }
  }, [])

  useEffect(() => { loadDay(selectedDate) }, [selectedDate, loadDay])
  useEffect(() => { fetchSettings() }, [fetchSettings])

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    const days = historyPeriod === '7d' ? 7 : historyPeriod === '30d' ? 30 : 90
    return client.foodAPI
      .history(days)
      .then((data) => setHistoryData((data as MacroHistoryPoint[]) || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [historyPeriod])
  useEffect(() => { loadHistory() }, [loadHistory])

  // Re-entry (e.g. back from the log flow) refetches the day — web relied on the router
  // location.key changing; here focus does the same. Skip the first focus (effects above
  // already ran on mount).
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) { focusedOnce.current = true; return }
      loadDay(selectedDate)
      loadHistory()
    }, [loadDay, selectedDate, loadHistory])
  )

  const onPullRefresh = useCallback(async () => {
    setPulling(true)
    await Promise.all([loadDay(selectedDate), loadHistory(), fetchSettings()])
    setPulling(false)
  }, [loadDay, selectedDate, loadHistory, fetchSettings])

  // Show the arrival toast once, then strip the param so it doesn't re-fire on re-render.
  useEffect(() => {
    if (params.logged) {
      setToast(params.logged === 'Updated' ? 'Entry updated' : `Added to ${params.logged}`)
      router.setParams({ logged: undefined })
    }
  }, [params.logged])

  const goDay = (date: string) => { hSelect(); setSelectedDate(date) }
  const openLog = (meal: Meal) => { hSelect(); router.push(`/nutrition/log?meal=${meal}&date=${selectedDate}`) }

  const handleDelete = async (entry: FoodLog) => {
    setDeletingId(entry.id)
    try {
      await client.foodAPI.delete(entry.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setLogs((prev) => prev.filter((l) => l.id !== entry.id))
      setConfirmEntry(null)
      client.foodAPI.stats(selectedDate).then(setStats).catch(() => {})
    } catch {
      setError('Failed to delete entry')
    } finally {
      setDeletingId(null)
    }
  }

  if (!hasLoadedRef.current) return <NutritionSkeleton />

  const totalCals = stats?.total_calories ?? 0
  const calTarget = settings.calorie_target || 2000
  const remaining = calTarget - totalCals
  const isOver = remaining < 0
  const calPct = Math.min(100, (totalCals / calTarget) * 100) || 0

  const isToday = selectedDate === todayStr()
  const selectedDateObj = new Date(selectedDate + 'T12:00:00')
  const prevDate = format(subDays(selectedDateObj, 1), 'yyyy-MM-dd')
  const nextDate = format(addDays(selectedDateObj, 1), 'yyyy-MM-dd')
  const canGoNext = selectedDate < todayStr()
  const dayLabel = isToday
    ? 'Today'
    : selectedDate === format(subDays(new Date(), 1), 'yyyy-MM-dd')
      ? 'Yesterday'
      : format(selectedDateObj, 'EEE, MMM d')

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={accent} colors={[accent]} />}
      >
        <View className="gap-4 py-4">
          <PageHeader
            title="Nutrition"
            subtitle="Macros & meals"
            action={<IconButton icon={Plus} variant="solid" size="md" label="Log Food" onPress={() => openLog('breakfast')} />}
          />

          {error ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
              <AlertCircle size={18} color={isDark ? brand.errorSoft : brand.error} />
              <AppText variant="body" color="error" className="flex-1">{error}</AppText>
            </View>
          ) : null}

          {/* Date navigator */}
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityLabel="Previous day"
              onPress={() => goDay(prevDate)}
              className="items-center justify-center rounded-xl p-3 active:scale-95"
            >
              <ChevronLeft size={20} color={colors.txMuted} />
            </Pressable>
            <View className="flex-1">
              <DateNavCenter
                dayLabel={dayLabel}
                yearLabel={!isToday ? format(selectedDateObj, 'yyyy') : undefined}
                value={selectedDate}
                onChange={goDay}
              />
            </View>
            <Pressable
              accessibilityLabel="Next day"
              disabled={!canGoNext}
              onPress={() => goDay(nextDate)}
              className={`items-center justify-center rounded-xl p-3 active:scale-95 ${canGoNext ? '' : 'opacity-30'}`}
            >
              <ChevronRight size={20} color={colors.txMuted} />
            </Pressable>
          </View>

          {/* Macro summary card */}
          <Card className="gap-5">
            {/* Calorie hero */}
            <View className="flex-row items-center justify-between">
              <View>
                <AppText variant="caption" color="muted" className="mb-1 uppercase" style={{ letterSpacing: 0.5 }}>Calories</AppText>
                <View className="flex-row items-baseline gap-1.5">
                  <AppText variant="display" style={{ fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] }}>{Math.round(totalCals)}</AppText>
                  <AppText variant="body" color="muted">/ {calTarget}</AppText>
                </View>
              </View>
              <View
                className="flex-row items-center gap-1.5 rounded-xl border px-3 py-2"
                style={{
                  backgroundColor: isOver ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)',
                  borderColor: isOver ? 'rgba(245,158,11,0.20)' : 'rgba(16,185,129,0.20)',
                }}
              >
                <Flame size={16} color={isOver ? '#fbbf24' : '#34d399'} />
                <AppText variant="bodySemibold" style={{ fontSize: 13, color: isOver ? '#fbbf24' : '#34d399' }}>
                  {isOver ? `${Math.round(Math.abs(remaining))} over` : `${Math.round(remaining)} left`}
                </AppText>
              </View>
            </View>

            {/* Segmented progress bar — fully explicit inline sizing (fixed heights on
                BOTH track and fill, no percentage heights) so native can't expand it. */}
            <View className="gap-1">
              <View style={{ height: 10, overflow: 'hidden', borderRadius: 999, backgroundColor: colors.muted }}>
                <View style={{ height: 10, width: `${calPct}%`, borderRadius: 999, backgroundColor: isOver ? MACRO_COLORS.carbs : brand.cyan }} />
              </View>
              <View className="flex-row justify-between">
                <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>0</AppText>
                <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>{calTarget} kcal goal</AppText>
              </View>
            </View>

            {/* Macro rings */}
            <View className="flex-row justify-around">
              <MacroRing value={stats?.total_protein ?? 0} target={settings.protein_target} color={MACRO_COLORS.protein} label="Protein" />
              <MacroRing value={stats?.total_carbs ?? 0} target={settings.carb_target} color={MACRO_COLORS.carbs} label="Carbs" />
              <MacroRing value={stats?.total_fat ?? 0} target={settings.fat_target} color={MACRO_COLORS.fat} label="Fat" />
            </View>
          </Card>

          {/* Meals */}
          <View className="gap-3">
            {MEALS.map((meal) => {
              const MealIcon = MEAL_ICONS[meal]
              const entries = logs.filter((l) => l.meal === meal)
              const mealCals = entries.reduce((sum, e) => sum + e.calories, 0)
              return (
                <Card key={meal} className="overflow-hidden p-0">
                  {/* Meal header */}
                  <View className="flex-row items-center gap-3 px-4 py-3.5">
                    <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface-muted">
                      <MealIcon size={16} color={MEAL_COLORS[meal]} />
                    </View>
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      <AppText variant="subheading">{MEAL_LABELS[meal]}</AppText>
                      {mealCals > 0 ? (
                        <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(mealCals)} kcal</AppText>
                      ) : null}
                    </View>
                    <IconButton icon={Plus} variant="solid" label={`Add to ${MEAL_LABELS[meal]}`} onPress={() => openLog(meal)} />
                  </View>

                  {entries.length === 0 ? (
                    <Pressable
                      onPress={() => openLog(meal)}
                      className="w-full border-t border-surface-border px-4 py-4 active:bg-surface-muted/50"
                    >
                      <AppText variant="caption" color="muted" className="text-center">＋ Tap to add food</AppText>
                    </Pressable>
                  ) : (
                    <View className="border-t border-surface-border">
                      {entries.map((entry, i) => (
                        <View key={entry.id} className={`flex-row items-center gap-2 px-4 py-3 ${i > 0 ? 'border-t border-surface-border' : ''}`}>
                          <Pressable
                            onPress={() => { hSelect(); router.push(`/nutrition/log?edit=${entry.id}&date=${selectedDate}`) }}
                            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
                          >
                            {entry.image_url ? (
                              <Image source={{ uri: entry.image_url }} className="h-11 w-11 rounded-xl border border-surface-border" />
                            ) : (
                              <View className="h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
                                <Utensils size={20} color={colors.txMuted} style={{ opacity: 0.4 }} />
                              </View>
                            )}
                            <View className="min-w-0 flex-1">
                              <AppText variant="bodySemibold" numberOfLines={1}>{entry.name}</AppText>
                              <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
                                <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(entry.calories)} kcal</AppText>
                                <MacroDot />
                                <AppText variant="caption" style={{ color: MACRO_TEXT.protein, fontVariant: ['tabular-nums'] }}>{entry.protein.toFixed(0)}g P</AppText>
                                <MacroDot />
                                <AppText variant="caption" style={{ color: MACRO_TEXT.carbs, fontVariant: ['tabular-nums'] }}>{entry.carbs.toFixed(0)}g C</AppText>
                                <MacroDot />
                                <AppText variant="caption" style={{ color: MACRO_TEXT.fat, fontVariant: ['tabular-nums'] }}>{entry.fat.toFixed(0)}g F</AppText>
                                {entry.servings !== 1 ? <AppText variant="caption" color="muted">× {entry.servings}</AppText> : null}
                              </View>
                            </View>
                            <ChevronRight size={16} color={colors.txMuted} />
                          </Pressable>
                          <IconButton icon={Trash2} variant="danger" label={`Delete ${entry.name}`} onPress={() => { hSelect(); setConfirmEntry(entry) }} />
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              )
            })}
          </View>

          {/* Macro history */}
          <Card>
            <SectionHeader
              title="Macro History"
              right={<View style={{ width: 150 }}><SegmentedControl size="sm" options={HISTORY_OPTIONS} value={historyPeriod} onChange={setHistoryPeriod} /></View>}
              className="mb-4"
            />
            <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              {historyLoading ? (
                <View className="h-48 items-center justify-center">
                  <AppText variant="caption" color="muted">Loading…</AppText>
                </View>
              ) : historyData.length === 0 ? (
                <View className="h-48 items-center justify-center gap-2">
                  <CalendarDays size={32} color={colors.txMuted} style={{ opacity: 0.4 }} />
                  <AppText variant="caption" color="muted">No data yet — start logging meals</AppText>
                </View>
              ) : (
                <MacroHistoryChart data={historyData} width={chartWidth} height={220} />
              )}
            </View>
            {/* Legend */}
            <View className="mt-4 flex-row justify-center gap-4">
              {[
                { color: MACRO_COLORS.protein, label: 'Protein' },
                { color: MACRO_COLORS.carbs, label: 'Carbs' },
                { color: MACRO_COLORS.fat, label: 'Fat' },
              ].map((m) => (
                <View key={m.label} className="flex-row items-center gap-1.5">
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: m.color }} />
                  <AppText variant="caption" color="muted">{m.label}</AppText>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Delete an entry — native confirm sheet (replaces web's inline confirm row). */}
      <ConfirmSheet
        {...deleteConfirmProps({ title: 'Delete entry?', subject: confirmEntry ? `"${confirmEntry.name}"` : 'This entry' })}
        open={confirmEntry != null}
        busy={deletingId != null}
        onConfirm={() => { if (confirmEntry) handleDelete(confirmEntry) }}
        onCancel={() => setConfirmEntry(null)}
      />

      {/* Success toast on arrival back from the log flow. */}
      {toast ? (
        <Toast variant="success" icon={CheckCircle2} title={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </Screen>
  )
}

function MacroDot() {
  return <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>·</AppText>
}

// The date-navigator center: a tappable pill showing the day label; tapping opens the
// platform date picker (via the shared DateInput's own picker). We hide DateInput's
// default field look and render our own pill so the label logic (Today/Yesterday/date)
// matches web while still using the vetted picker + max-date behavior.
function DateNavCenter({ dayLabel, yearLabel, value, onChange }: {
  dayLabel: string; yearLabel?: string; value: string; onChange: (v: string) => void
}) {
  const { colors } = useTheme()
  return (
    <View>
      {/* Visible pill */}
      <View pointerEvents="none" className="flex-row items-center justify-center gap-2 rounded-xl bg-surface-muted py-2.5">
        <CalendarDays size={16} color={colors.txMuted} />
        <AppText variant="bodySemibold" style={{ fontSize: 14 }}>{dayLabel}</AppText>
        {yearLabel ? <AppText variant="caption" color="muted">{yearLabel}</AppText> : null}
      </View>
      {/* Transparent picker overlay filling the pill */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}>
        <DateInput value={value} onChange={onChange} maximumDate={new Date()} />
      </View>
    </View>
  )
}
