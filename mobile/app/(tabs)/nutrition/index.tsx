import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, useWindowDimensions, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { format, subDays, addDays } from 'date-fns'
import {
  AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Flame, Plus, Utensils,
} from 'lucide-react-native'
import { todayStr, type DailyStats, type FoodLog } from '@lyftr/shared'
import {
  AppText, Card, DateInput, IconButton, Label, PageHeader, Screen, SearchField, SectionHeader, SegmentedControl, Toast,
} from '../../../src/components/ui'
import { MacroRing, MacroHistoryChart, type MacroHistoryPoint } from '../../../src/components/nutrition/NutritionCharts'
import { FoodEntryRow } from '../../../src/components/nutrition/FoodEntryRow'
import { NutritionSkeleton } from '../../../src/components/nutrition/NutritionSkeleton'
import { MACRO_COLORS, MEALS, type Meal } from '../../../src/components/nutrition/nutritionMeta'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

const HISTORY_PERIODS = ['7d', '30d', '90d'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]
const HISTORY_OPTIONS = HISTORY_PERIODS.map((p) => ({ value: p, label: p }))

// The day's food renders as a paginated, searchable list at the bottom (same growing-
// list feel as Weight/Programs). A day is bounded (all logs arrive in one /food?date=
// call), so paging + search are client-side over the loaded set rather than server round
// trips — reveal a page at a time on scroll, filter by name in memory.
const FOOD_PAGE = 12

// Top-level split: "Diary" is the per-day summary + food log; "Trends" is the multi-day
// macro history. Keeps the per-day view a food-log-first surface (summary → list) while
// the analytical chart lives one tap away instead of pushing the list down the page.
const VIEW_OPTIONS = [
  { value: 'diary', label: 'Diary' },
  { value: 'trends', label: 'Trends' },
] as const
type NutritionView = typeof VIEW_OPTIONS[number]['value']

// Port of web/pages/Food.tsx — the daily Nutrition dashboard, mobile-polished: date
// navigator + haptics, calorie hero + macro rings, four meal cards with entries whose
// delete routes through the native ConfirmSheet (not web's inline row), the macro-
// history chart, and a success Toast on arrival back from a log. Calorie/macro targets
// come from the settings store (the mobile equivalent of web's userAPI.getSettings).
const hSelect = () => Haptics.selectionAsync().catch(() => {})

// With per-meal add gone, the single Log Food button seeds the meal from the time of day
// (still changeable in the log flow's meal picker).
const mealForNow = (): Meal => {
  const h = new Date().getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks'
}

export default function Nutrition() {
  const { colors, brand, accent, isDark } = useTheme()
  const { width: windowWidth } = useWindowDimensions()
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

  const [pulling, setPulling] = useState(false)
  const hasLoadedRef = useRef(false)

  // Diary (per-day summary + log) vs Trends (multi-day macro chart).
  const [view, setView] = useState<NutritionView>('diary')

  // Bottom food list: search query + how many rows are revealed (grows on scroll).
  const [foodQuery, setFoodQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(FOOD_PAGE)
  // Reset paging to the first page when the day changes or the query changes.
  useEffect(() => { setVisibleCount(FOOD_PAGE) }, [selectedDate, foodQuery])

  const loadDay = useCallback(async (date: string) => {
    // Stale-while-revalidate: keep the previous day's logs/stats on screen until the new
    // day's data lands, so paging days doesn't flash the hero/rings/list to empty (the
    // same no-empty-flash behavior the Weight/Programs lists have). Only errors reset.
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

  // Kebab-delete drops the row and refreshes the day's totals (rings + calorie hero).
  const onEntryDeleted = useCallback((entryId: number) => {
    setLogs((prev) => prev.filter((l) => l.id !== entryId))
    client.foodAPI.stats(selectedDate).then(setStats).catch(() => {})
  }, [selectedDate])

  if (!hasLoadedRef.current) return <NutritionSkeleton />

  const totalCals = stats?.total_calories ?? 0
  const calTarget = settings.calorie_target || 2000
  const remaining = calTarget - totalCals
  const isOver = remaining < 0
  const calPct = Math.min(100, (totalCals / calTarget) * 100) || 0

  // One flat list, ordered by meal (breakfast → snacks) so same-meal items group.
  const dayEntries = MEALS.flatMap((m) => logs.filter((l) => l.meal === m))

  // Name search (client-side over the loaded day) + page reveal.
  const q = foodQuery.trim().toLowerCase()
  const filteredEntries = q ? dayEntries.filter((e) => e.name.toLowerCase().includes(q)) : dayEntries
  const visibleEntries = filteredEntries.slice(0, visibleCount)
  const hasMoreFood = visibleCount < filteredEntries.length
  const loadMoreFood = () => { if (hasMoreFood) setVisibleCount((c) => c + FOOD_PAGE) }

  // Trends: average daily macros over the loaded history window.
  const histDays = historyData.length
  const avgMacro = (key: 'protein' | 'carbs' | 'fat') =>
    histDays ? Math.round(historyData.reduce((s, d) => s + (d[key] || 0), 0) / histDays) : 0
  const isDiary = view === 'diary'
  // Chart width: prefer the measured value, but seed a computed fallback (window − Screen
  // px-5 − Card p-4 = 72) so the chart renders immediately on first switch to Trends
  // instead of waiting for an onLayout that doesn't reliably fire on the view-swap.
  const chartW = chartWidth || Math.max(0, windowWidth - 72)

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

  // The whole screen is a single FlatList so the food rows virtualize (only on-screen
  // rows mount, and their thumbnails load lazily) instead of every entry — plus its
  // remote image — mounting at once. All the static chrome (calorie hero, rings, macro
  // history) rides in the header so the searchable/paginated food list sits at the
  // bottom; the visible rows are the list `data`.
  const lastEntryIdx = visibleEntries.length - 1

  return (
    <Screen>
      <FlatList
        data={isDiary ? visibleEntries : []}
        keyExtractor={(e) => String(e.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMoreFood}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={accent} colors={[accent]} />}
        // The rows share one rounded card. With a real list we can't wrap them in a
        // single <Card>, so we rebuild that frame per row: continuous left/right borders,
        // rounded + bordered top on the first row and bottom on the last. overflow-hidden
        // clips each row's active-press tint to those rounded corners.
        renderItem={({ item, index }) => (
          <View
            className={`overflow-hidden border-l border-r border-surface-border bg-surface-raised ${index === 0 ? 'rounded-t-xl border-t' : ''} ${index === lastEntryIdx ? 'rounded-b-xl border-b' : ''}`}
          >
            <FoodEntryRow
              entry={item}
              first={index === 0}
              onPress={() => { hSelect(); router.push(`/nutrition/${item.id}`) }}
              onEdit={() => router.push(`/nutrition/log?edit=${item.id}`)}
              onDeleted={onEntryDeleted}
            />
          </View>
        )}
        ListHeaderComponent={
          <View className="pt-4">
            <View className="gap-4">
              <PageHeader
                title="Nutrition"
                subtitle="Macros & meals"
                action={<IconButton icon={Plus} variant="solid" size="md" label="Log Food" onPress={() => openLog(mealForNow())} />}
              />

              {error ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
                  <AlertCircle size={18} color={isDark ? brand.errorSoft : brand.error} />
                  <AppText variant="body" color="error" className="flex-1">{error}</AppText>
                </View>
              ) : null}

              {/* Diary (per-day log) vs Trends (multi-day chart) */}
              <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />

              {isDiary ? (
              <>
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

                {/* Macro rings — three equal flex-1 columns so they sit centered across the
                    full card width. (justify-around packed them left because each ring's
                    "Protein / 65g" label is wider than the 72px ring, making the flex items
                    uneven.) */}
                <View className="flex-row">
                  <View className="flex-1 items-center">
                    <MacroRing value={stats?.total_protein ?? 0} target={settings.protein_target} color={MACRO_COLORS.protein} label="Protein" />
                  </View>
                  <View className="flex-1 items-center">
                    <MacroRing value={stats?.total_carbs ?? 0} target={settings.carb_target} color={MACRO_COLORS.carbs} label="Carbs" />
                  </View>
                  <View className="flex-1 items-center">
                    <MacroRing value={stats?.total_fat ?? 0} target={settings.fat_target} color={MACRO_COLORS.fat} label="Fat" />
                  </View>
                </View>
              </Card>
              </>
              ) : (
              <>
              {/* Daily-average macros over the selected history window */}
              <View className="gap-2">
                <Label className="px-1">Daily average · {historyPeriod}</Label>
                <View className="flex-row gap-3">
                  {([
                    ['Protein', 'protein', MACRO_COLORS.protein],
                    ['Carbs', 'carbs', MACRO_COLORS.carbs],
                    ['Fat', 'fat', MACRO_COLORS.fat],
                  ] as const).map(([label, key, color]) => (
                    <Card key={key} className="flex-1" style={{ paddingHorizontal: 12 }}>
                      <View className="mb-2 flex-row items-center gap-1.5">
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                        <Label numberOfLines={1}>{label}</Label>
                      </View>
                      <View className="flex-row items-end gap-1">
                        <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{avgMacro(key)}</AppText>
                        <AppText variant="caption" color="muted" className="mb-0.5">g</AppText>
                      </View>
                    </Card>
                  ))}
                </View>
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
                    <MacroHistoryChart data={historyData} width={chartW} height={220} />
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
              </>
              )}
            </View>

            {/* Food log at the bottom — searchable + paged (Diary only). Each row carries
                its meal as a chip; ordered by meal so same-meal items sit together. */}
            {isDiary ? (
            <View className="mt-8 gap-3 pb-3">
              <View className="flex-row items-center justify-between px-1">
                <Label>{isToday ? "Today's Food" : 'Food'}</Label>
                {dayEntries.length > 0 ? (
                  <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {q ? `${filteredEntries.length} of ${dayEntries.length}` : `${dayEntries.length} ${dayEntries.length === 1 ? 'item' : 'items'}`}
                  </AppText>
                ) : null}
              </View>
              {dayEntries.length > 0 ? (
                <SearchField value={foodQuery} onChangeText={setFoodQuery} placeholder="Search this day's food…" />
              ) : null}
            </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !isDiary ? null : q ? (
            <View className="items-center px-4 py-8">
              <Utensils size={28} color={colors.txMuted} style={{ opacity: 0.4 }} />
              <AppText variant="body" color="muted" className="mt-2">No matches for “{foodQuery.trim()}”</AppText>
            </View>
          ) : (
            <Card className="overflow-hidden p-0">
              <Pressable onPress={() => openLog(mealForNow())} className="items-center px-4 py-10 active:opacity-70">
                <Utensils size={32} color={colors.txMuted} style={{ opacity: 0.4 }} />
                <AppText variant="body" color="muted" className="mt-2">No food logged yet</AppText>
                <AppText variant="caption" color="muted" className="mt-1">Tap to log your first meal</AppText>
              </Pressable>
            </Card>
          )
        }
        ListFooterComponent={
          isDiary && hasMoreFood ? (
            <View className="items-center py-3">
              <ActivityIndicator size="small" color={accent} />
            </View>
          ) : null
        }
      />

      {/* Success toast on arrival back from the log flow. */}
      {toast ? (
        <Toast variant="success" icon={CheckCircle2} title={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </Screen>
  )
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
