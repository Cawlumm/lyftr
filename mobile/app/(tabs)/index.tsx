import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import {
  eachDayOfInterval, endOfWeek, format, isSameDay, startOfWeek, subWeeks,
} from 'date-fns'
import {
  Activity, AlertCircle, ArrowRight, Dumbbell, Play, Plus, Scale, Timer, TrendingUp,
} from 'lucide-react-native'
import {
  displayVolume, displayWeight, weightShort,
  type DailyStats, type WeightLog, type WeightStats, type Workout,
} from '@lyftr/shared'
import { AppText, Card, Label, Screen, SectionHeader, SegmentedControl } from '../../src/components/ui'
import { ExerciseImage } from '../../src/components/workouts/ExerciseImage'
import {
  MuscleDonut, MuscleSparkline, VolumeBarChart, WeightSparkline,
} from '../../src/components/dashboard/DashboardCharts'
import { QuickWeighInSheet } from '../../src/components/dashboard/QuickWeighInSheet'
import { DashboardSkeleton } from '../../src/components/dashboard/DashboardSkeleton'
import { client, useAuthStore, useSettingsStore, useWorkoutSession } from '../../src/lib/lyftr'
import { muscleColor } from '../../src/utils/exerciseUtils'
import { useTheme } from '../../src/theme/useTheme'

// Native tap feedback (matches the rest of the app): selection tick for navigations /
// sheet-opens, a firmer impact for the primary Start action.
const hSelect = () => Haptics.selectionAsync().catch(() => {})
const hImpact = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})

function greeting(now: Date) {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Coerce reps/weight to finite numbers: a set with a missing field would otherwise make
// the product NaN, which poisons the whole volume sum → NaN bar heights → a hard
// react-native-svg crash on native (web silently drops NaN geometry).
const calcVolume = (w: Workout) =>
  (w.exercises ?? []).reduce(
    (s, ex) => s + (ex.sets ?? []).reduce((ss, set) => ss + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0),
    0
  )

const DEFAULT_FOOD: DailyStats = {
  date: '', total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, total_fiber: 0, workout_count: 0,
}

// recharts-slice colors, ported verbatim from web (donut + legend + sparklines).
const MUSCLE_HEX: Record<string, string> = {
  chest: '#f87171', back: '#60a5fa', shoulders: '#818cf8', biceps: '#f472b6', triceps: '#a78bfa',
  legs: '#34d399', quadriceps: '#34d399', hamstrings: '#6ee7b7', glutes: '#86efac', calves: '#4ade80',
  core: '#fbbf24', abs: '#fbbf24', forearms: '#fb923c', traps: '#94a3b8', lats: '#38bdf8', 'full body': '#e879f9',
}
const muscleHex = (m: string) => MUSCLE_HEX[m?.toLowerCase()] ?? '#6366f1'

const MUSCLE_ROAST: Record<string, string> = {
  chest: 'All chest, no legs. Classic bro.',
  back: 'Built like a refrigerator. Respect.',
  shoulders: "Can't fit through doorways. Good.",
  biceps: 'Mirror selfies loading…',
  triceps: 'Horseshoe gang. Handshakes must be terrifying.',
  legs: "Actually training legs. You're a unicorn.",
  quadriceps: "Quads for days. Jeans don't stand a chance.",
  hamstrings: 'Posterior chain warrior. Deadlift god incoming.',
  glutes: 'Glute guy/gal. We respect the commitment.',
  calves: 'Calf king/queen. The rarest of all lifters.',
  core: 'Beach season ready 365 days a year.',
  abs: 'Six pack incoming. Or already here. Either way.',
  forearms: 'Popeye called. He wants his arms back.',
  traps: 'No neck, no problem.',
  lats: 'Walking around like a cobra. Wings deployed.',
  'full body': 'A true all-rounder. Or you just did burpees.',
}
const muscleRoast = (m: string) => MUSCLE_ROAST[m?.toLowerCase()] ?? 'Mysterious training patterns. We respect it.'

const VOL_OPTIONS = [
  { value: '7' as const, label: '7' }, { value: '14' as const, label: '14' }, { value: '30' as const, label: '30' },
]

function ProgressBar({ pct, color, opacity = 1, className = '' }: { pct: number; color: string; opacity?: number; className?: string }) {
  const p = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
  return (
    <View className={`h-1.5 overflow-hidden rounded-full bg-surface-muted ${className}`}>
      <View style={{ width: `${p}%`, height: '100%', borderRadius: 999, backgroundColor: color, opacity }} />
    </View>
  )
}

function MuscleBadge({ muscle }: { muscle: string }) {
  const { colors } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View className={`self-start rounded px-1.5 py-0.5 ${tint?.chip ?? 'bg-surface-muted'}`}>
      <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>{muscle}</AppText>
    </View>
  )
}

// Section "See all"/"View" link — a right-aligned brand row with a chevron + haptic.
function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { accent } = useTheme()
  return (
    <Pressable onPress={() => { hSelect(); onPress() }} hitSlop={8} className="flex-row items-center gap-0.5 active:opacity-60">
      <AppText variant="caption" color="brand">{label}</AppText>
      <ArrowRight size={12} color={accent} />
    </Pressable>
  )
}

export default function Dashboard() {
  const now = useMemo(() => new Date(), [])
  const session = useWorkoutSession((s) => s.session)
  const user = useAuthStore((s) => s.user)
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const unit = settings.weight_unit
  const wUnit = weightShort(unit)
  const { colors, accent, brand, isDark } = useTheme()

  // Consistency heatmap cell fill — explicit hex (not NativeWind opacity classes, which
  // wash out on the light theme + don't render reliably on native): empty is a visible
  // gray (border, not the near-white `muted`), and workout days are solid cyan that gets
  // MORE prominent with count on both themes (darker on light, brighter on dark).
  const heatFill = (count: number, future: boolean) => {
    if (future) return colors.muted
    if (count === 0) return colors.border
    if (count === 1) return isDark ? brand.cyanEdge : brand.cyan
    return isDark ? brand.cyanLight : brand.cyanEdge
  }

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [food, setFood] = useState<DailyStats>(DEFAULT_FOOD)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [weightStats, setWeightStats] = useState<WeightStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [volumePeriod, setVolumePeriod] = useState<'7' | '14' | '30'>('7')
  const [chartWidth, setChartWidth] = useState(0)
  const [sparkWidth, setSparkWidth] = useState(0)
  const [heatSel, setHeatSel] = useState<{ day: Date; count: number } | null>(null)

  const load = useCallback(async () => {
    const [ws, fs, wl, wst] = await Promise.all([
      client.workoutAPI.list({ limit: 84 }).catch(() => [] as Workout[]),
      client.foodAPI.stats(format(new Date(), 'yyyy-MM-dd')).catch(() => DEFAULT_FOOD),
      client.weightAPI.list({ limit: 14 }).catch(() => [] as WeightLog[]),
      client.weightAPI.stats().catch(() => null),
    ])
    setWorkouts(ws || [])
    setFood(fs || DEFAULT_FOOD)
    setWeightLogs(wl || [])
    setWeightStats(wst)
  }, [])

  useEffect(() => {
    fetchSettings()
    load()
      .catch((err) => setError(err?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [fetchSettings, load])

  // Keep-mounted tab → refetch on re-focus (skip the first, the mount effect fetched).
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) { focusedOnce.current = true; return }
      load()
    }, [load])
  )

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <Screen>
        <View className="py-4">
          <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
            <AlertCircle size={18} color={brand.errorSoft} />
            <Text className="flex-1 font-sans text-sm text-error-400">{error}</Text>
          </View>
        </View>
      </Screen>
    )
  }

  // ── Derived data (unchanged from the 1:1 port) ─────────────────────────────
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekWorkouts = workouts.filter((w) => new Date(w.started_at) >= weekStart)
  const lastWorkout = workouts[0] ?? null

  const chartData = workouts.slice(0, Number(volumePeriod)).reverse().map((w) => ({
    date: format(new Date(w.started_at), 'M/d'),
    volume: displayVolume(calcVolume(w), unit),
    name: w.name,
  }))

  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(now, { weekStartsOn: 1 }) })

  const heatmapStart = startOfWeek(subWeeks(now, 11), { weekStartsOn: 1 })
  const heatmapEnd = endOfWeek(now, { weekStartsOn: 1 })
  const heatmapDays = eachDayOfInterval({ start: heatmapStart, end: heatmapEnd })
  const workoutDayMap = new Map<string, number>()
  workouts.forEach((w) => {
    const k = format(new Date(w.started_at), 'yyyy-MM-dd')
    workoutDayMap.set(k, (workoutDayMap.get(k) || 0) + 1)
  })
  const heatmapWeeks: Date[][] = []
  for (let i = 0; i < heatmapDays.length; i += 7) heatmapWeeks.push(heatmapDays.slice(i, i + 7))
  const monthLabels: (string | null)[] = heatmapWeeks.map((week, i) => {
    const m = format(week[0], 'MMM')
    if (i === 0) return m
    return m !== format(heatmapWeeks[i - 1][0], 'MMM') ? m : null
  })

  const muscleMap = new Map<string, number>()
  workouts.forEach((w) => {
    (w.exercises ?? []).forEach((ex) => {
      const mg = ex.exercise?.muscle_group || 'other'
      muscleMap.set(mg, (muscleMap.get(mg) || 0) + (ex.sets ?? []).length)
    })
  })
  const muscleData = Array.from(muscleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))
  const totalMuscSets = muscleData.reduce((s, d) => s + d.value, 0)

  const sparklineWorkouts = workouts.slice(0, 10).reverse()
  const muscleSparklines = new Map<string, number[]>()
  muscleData.forEach(({ name }) => {
    muscleSparklines.set(name, sparklineWorkouts.map((w) =>
      (w.exercises ?? [])
        .filter((ex) => ex.exercise?.muscle_group === name)
        .reduce((s, ex) => s + (ex.sets ?? []).length, 0)
    ))
  })
  const topMuscle = muscleData[0]?.name ?? null

  const calPct = Math.min(100, (food.total_calories / settings.calorie_target) * 100) || 0
  const protPct = Math.min(100, (food.total_protein / settings.protein_target) * 100) || 0
  const carbsPct = Math.min(100, (food.total_carbs / settings.carb_target) * 100) || 0
  const fatPct = Math.min(100, (food.total_fat / settings.fat_target) * 100) || 0

  const sparkData = [...weightLogs].reverse().map((l) => ({
    date: format(new Date(l.logged_at), 'M/d'),
    weight: displayWeight(l.weight, unit),
  }))

  const username = user?.email?.split('@')[0] ?? 'there'
  const avatarInitial = (username[0] ?? 'U').toUpperCase()

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
      >
        <View className="gap-5 py-4">
          {/* ── Header ── */}
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="font-sans-medium text-[11px] uppercase text-tx-muted" style={{ letterSpacing: 1 }}>
                {format(now, 'EEEE, MMMM d')}
              </Text>
              <AppText variant="title" className="mt-0.5" numberOfLines={1}>{greeting(now)}, {username}</AppText>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => { hImpact(); router.navigate('/workouts/start') }}
                className="flex-row items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 active:scale-95"
              >
                <Play size={15} color="#fff" />
                <Text className="font-sans-bold text-sm text-white">{session ? 'Resume' : 'Start'}</Text>
              </Pressable>
              {/* Avatar → Settings. Settings moved off the footer; this is its entry point. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={() => { hSelect(); router.navigate('/settings') }}
                hitSlop={6}
                className="active:scale-95"
              >
                <LinearGradient
                  colors={['#0891b2', '#00b8d9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text className="font-sans-bold text-sm text-white">{avatarInitial}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          {/* ── Active-session banner ── */}
          {session ? (
            <Pressable
              onPress={() => { hSelect(); router.navigate('/workouts/active') }}
              className="flex-row items-center justify-between rounded-2xl border border-warning-500/30 bg-warning-500/10 p-3.5 active:scale-[0.99]"
            >
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl border border-warning-500/30 bg-warning-500/20">
                  <Timer size={18} color={brand.warningSoft} />
                </View>
                <View>
                  <Text className="font-sans-semibold text-sm text-warning-400">Workout in progress</Text>
                  <Text className="text-xs" style={{ color: brand.warningSoft, opacity: 0.7 }}>{session.name} — tap to resume</Text>
                </View>
              </View>
              <ArrowRight size={18} color={brand.warningSoft} />
            </Pressable>
          ) : null}

          {/* ── This Week (sessions + current-week dots) ── */}
          <Card>
            <View className="flex-row items-start justify-between">
              <View>
                <Label>This Week</Label>
                <View className="mt-1 flex-row items-end gap-1.5">
                  <AppText variant="display" style={{ fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] }}>{weekWorkouts.length}</AppText>
                  <AppText variant="caption" color="muted" className="mb-2">{weekWorkouts.length === 1 ? 'session' : 'sessions'}</AppText>
                </View>
              </View>
              <View className="h-9 w-9 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                <Dumbbell size={18} color={accent} />
              </View>
            </View>
            <View className="mt-4 flex-row items-center justify-between px-0.5">
              {weekDays.map((day, i) => {
                const hasWorkout = workouts.some((w) => isSameDay(new Date(w.started_at), day))
                const isToday = isSameDay(day, now)
                const isFuture = day > now
                return (
                  <View key={i} className="items-center gap-1.5">
                    <Text className={`text-[10px] font-sans-semibold ${isToday ? 'text-brand-400' : 'text-tx-muted'}`}>{format(day, 'EEEEE')}</Text>
                    <View className={`h-3.5 w-3.5 rounded-full ${
                      hasWorkout ? 'bg-brand-500' : isToday ? 'border-2 border-brand-500/60' : isFuture ? 'bg-surface-border/20' : 'bg-surface-border/60'
                    }`} />
                  </View>
                )
              })}
            </View>
          </Card>

          {/* ── Volume Trend ── */}
          <Card>
            <SectionHeader
              icon={TrendingUp}
              title="Volume Trend"
              right={<View style={{ width: 132 }}><SegmentedControl size="sm" options={VOL_OPTIONS} value={volumePeriod} onChange={setVolumePeriod} /></View>}
              className="mb-3"
            />
            {chartData.length === 0 ? (
              <View className="items-center justify-center gap-2 py-10">
                <Dumbbell size={26} color={colors.txMuted} style={{ opacity: 0.4 }} />
                <AppText variant="caption" color="muted">Log workouts to see trends</AppText>
              </View>
            ) : (
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                <VolumeBarChart data={chartData} width={chartWidth} unit={wUnit} height={150} />
              </View>
            )}
          </Card>

          {/* ── Consistency heatmap ── */}
          <Card>
            <SectionHeader
              icon={Activity}
              title="Consistency"
              right={<AppText variant="caption" color="muted">12 weeks</AppText>}
              className="mb-3"
            />
            {workouts.length === 0 ? (
              <View className="items-center justify-center gap-2 py-6">
                <AppText variant="caption" color="muted">Start working out to build your streak</AppText>
              </View>
            ) : (
              <>
                <View className="flex-row" style={{ gap: 2, marginBottom: 2 }}>
                  <View style={{ width: 14 }} />
                  {heatmapWeeks.map((_, i) => (
                    <View key={i} className="flex-1">
                      <Text className="text-[9px] text-tx-muted" numberOfLines={1}>{monthLabels[i] ?? ''}</Text>
                    </View>
                  ))}
                </View>
                <View className="flex-row" style={{ gap: 2 }}>
                  <View style={{ width: 14, gap: 2 }}>
                    {(['M', '', 'W', '', 'F', '', 'S'] as const).map((lbl, di) => (
                      <View key={di} className="h-3 justify-center">
                        <Text className="text-[9px] text-tx-muted/60">{lbl}</Text>
                      </View>
                    ))}
                  </View>
                  {heatmapWeeks.map((week, wi) => (
                    <View key={wi} className="flex-1" style={{ gap: 2 }}>
                      {week.map((day, di) => {
                        const k = format(day, 'yyyy-MM-dd')
                        const count = workoutDayMap.get(k) || 0
                        const future = day > now
                        const isSel = heatSel != null && isSameDay(heatSel.day, day)
                        return (
                          <Pressable
                            key={di}
                            onPress={() => { hSelect(); setHeatSel((c) => (c && isSameDay(c.day, day) ? null : { day, count })) }}
                            style={{
                              height: 12,
                              borderRadius: 2,
                              backgroundColor: heatFill(count, future),
                              borderWidth: isSel ? 1.5 : 0,
                              borderColor: brand.cyanLight,
                            }}
                          />
                        )
                      })}
                    </View>
                  ))}
                </View>
                {heatSel ? (
                  <AppText variant="caption" color="muted" className="mt-1.5">
                    {format(heatSel.day, 'MMM d')}{heatSel.count > 0 ? ` · ${heatSel.count} workout${heatSel.count > 1 ? 's' : ''}` : ' · rest day'}
                  </AppText>
                ) : null}
                <View className="mt-2 flex-row items-center justify-end gap-1.5">
                  <Text className="text-[9px] text-tx-muted">Less</Text>
                  {[colors.border, isDark ? brand.cyanEdge : brand.cyan, isDark ? brand.cyanLight : brand.cyanEdge].map((c, i) => (
                    <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c }} />
                  ))}
                  <Text className="text-[9px] text-tx-muted">More</Text>
                </View>
              </>
            )}
          </Card>

          {/* ── Last workout ── */}
          {lastWorkout ? (() => {
            const exs = lastWorkout.exercises ?? []
            const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)
            const totalVolume = displayVolume(calcVolume(lastWorkout), unit)
            const mins = Math.round(lastWorkout.duration / 60)
            return (
              <Pressable onPress={() => { hSelect(); router.navigate(`/workouts/${lastWorkout.id}`) }} className="active:scale-[0.99]">
                <Card>
                  <View className="mb-3 flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Label className="mb-1">Last workout</Label>
                      <Text className="font-sans-semibold text-base text-tx-primary" numberOfLines={1}>{lastWorkout.name}</Text>
                      <AppText variant="caption" color="muted" className="mt-0.5">
                        {format(new Date(lastWorkout.started_at), 'MMM d')}
                        {mins > 0 ? ` · ${mins} min` : ''}
                        {totalSets > 0 ? ` · ${totalSets} sets` : ''}
                        {totalVolume > 0 ? ` · ${totalVolume.toLocaleString()} ${wUnit}` : ''}
                      </AppText>
                    </View>
                    <LinkRow label="All" onPress={() => router.navigate('/workouts')} />
                  </View>
                  <View className="gap-2.5">
                    {exs.slice(0, 4).map((ex, i) => {
                      const sets = ex.sets ?? []
                      const best = sets.length > 0 ? sets.reduce((b, s) => (s.weight > b.weight ? s : b), sets[0]) : null
                      return (
                        <View key={ex.id ?? i} className="flex-row items-center gap-2.5">
                          <ExerciseImage url={ex.exercise.image_url} size="row" />
                          <View className="min-w-0 flex-1 gap-1">
                            <Text className="text-sm text-tx-secondary" numberOfLines={1}>{ex.exercise.name}</Text>
                            <MuscleBadge muscle={ex.exercise.muscle_group} />
                          </View>
                          {best ? (
                            <Text className="text-xs text-tx-muted" style={{ fontVariant: ['tabular-nums'] }}>
                              {sets.length}×{best.weight > 0 ? ` ${displayWeight(best.weight, unit)}${wUnit}` : ' BW'}
                            </Text>
                          ) : null}
                        </View>
                      )
                    })}
                  </View>
                  {exs.length > 4 ? (
                    <AppText variant="caption" color="muted" className="pt-2 text-center">+{exs.length - 4} more exercises</AppText>
                  ) : null}
                </Card>
              </Pressable>
            )
          })() : (
            <Card className="items-center justify-center gap-2" style={{ minHeight: 148 }}>
              <Dumbbell size={30} color={colors.txMuted} style={{ opacity: 0.4 }} />
              <AppText variant="body" color="muted">No workouts logged yet</AppText>
              <Pressable onPress={() => { hSelect(); router.navigate('/workouts/start') }} hitSlop={6} className="active:opacity-60">
                <AppText variant="caption" color="brand">Start your first workout →</AppText>
              </Pressable>
            </Card>
          )}

          {/* ── Muscle Balance ── */}
          <Card>
            <SectionHeader
              icon={Dumbbell}
              title="Muscle Balance"
              right={<AppText variant="caption" color="muted">{workouts.length} workouts</AppText>}
              className="mb-1"
            />
            {topMuscle ? (
              <AppText variant="caption" color="muted" className="mb-3 italic">{muscleRoast(topMuscle)}</AppText>
            ) : (
              <AppText variant="caption" color="muted" className="mb-3">Log workouts to see which muscles you train most.</AppText>
            )}
            {muscleData.length === 0 ? (
              <View className="items-center justify-center gap-2 py-6">
                <Dumbbell size={26} color={colors.txMuted} style={{ opacity: 0.3 }} />
                <AppText variant="caption" color="muted">No workout data yet</AppText>
              </View>
            ) : (
              <View className="items-center gap-4">
                <MuscleDonut data={muscleData} total={totalMuscSets} colorFor={muscleHex} size={168} />
                <View className="w-full gap-2.5">
                  {muscleData.map((d) => {
                    const pct = Math.round((d.value / totalMuscSets) * 100)
                    const isTop = d.name === topMuscle
                    const values = muscleSparklines.get(d.name) ?? []
                    const color = muscleHex(d.name)
                    return (
                      <View key={d.name}>
                        <View className="mb-0.5 flex-row items-center gap-2">
                          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          <Text className={`flex-1 text-xs capitalize ${isTop ? 'font-sans-semibold text-tx-primary' : 'text-tx-secondary'}`} numberOfLines={1}>
                            {d.name}{isTop ? <Text className="text-[9px] uppercase text-tx-muted"> top</Text> : null}
                          </Text>
                          <MuscleSparkline values={values} color={color} isTop={isTop} />
                          <Text className="w-16 text-right text-xs text-tx-muted" style={{ fontVariant: ['tabular-nums'] }}>{d.value} · {pct}%</Text>
                        </View>
                        <ProgressBar pct={pct} color={color} opacity={isTop ? 1 : 0.6} />
                      </View>
                    )
                  })}
                </View>
              </View>
            )}
          </Card>

          {/* ── Today's Nutrition (also covers the Cals/Protein once in the KPI strip) ── */}
          <Card>
            {/* Web links "Log →" to /food; hidden on mobile until a Food page exists. */}
            <AppText variant="subheading" className="mb-3">Today's Nutrition</AppText>
            <View className="mb-3 flex-row items-baseline gap-1.5">
              <Text className="font-display-heavy text-tx-primary" style={{ fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] }}>{Math.round(food.total_calories)}</Text>
              <AppText variant="caption" color="muted">/ {settings.calorie_target} kcal</AppText>
              <View className="flex-1" />
              <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(calPct)}%</AppText>
            </View>
            <ProgressBar pct={calPct} color="#00b8d9" className="mb-4" />
            <View className="gap-3">
              {[
                { label: 'Protein', val: food.total_protein, target: settings.protein_target, pct: protPct, color: '#3b82f6' },
                { label: 'Carbs', val: food.total_carbs, target: settings.carb_target, pct: carbsPct, color: '#f59e0b' },
                { label: 'Fat', val: food.total_fat, target: settings.fat_target, pct: fatPct, color: '#8b5cf6' },
              ].map((m) => (
                <View key={m.label}>
                  <View className="mb-1 flex-row items-center justify-between">
                    <AppText variant="caption" color="muted">{m.label}</AppText>
                    <Text className="text-xs font-sans-semibold text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>
                      {Math.round(m.val)}g<Text className="font-sans font-normal text-tx-muted"> / {m.target}g</Text>
                    </Text>
                  </View>
                  <ProgressBar pct={m.pct} color={m.color} />
                </View>
              ))}
            </View>
          </Card>

          {/* ── Weight quick-log ── */}
          <Card>
            <SectionHeader
              icon={Scale}
              title="Weight"
              right={<LinkRow label="View" onPress={() => router.navigate('/weight')} />}
              className="mb-2"
            />
            {weightLogs.length === 0 ? (
              <Pressable
                onPress={() => { hSelect(); setSheetOpen(true) }}
                className="flex-row items-center gap-3 rounded-2xl border border-dashed border-brand-500/30 bg-brand-500/5 p-3.5 active:scale-[0.99]"
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                  <Plus size={18} color={accent} />
                </View>
                <View>
                  <Text className="text-sm font-sans-semibold text-tx-primary">Log your first weight</Text>
                  <AppText variant="caption" color="muted">Tap to start tracking</AppText>
                </View>
              </Pressable>
            ) : (
              <Pressable onPress={() => { hSelect(); setSheetOpen(true) }} className="active:scale-[0.99]" accessibilityLabel="Log weight">
                <View className="mb-2 flex-row items-center justify-between">
                  <View className="flex-row items-baseline gap-1.5">
                    <AppText variant="display" style={{ fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] }}>{displayWeight(weightLogs[0].weight, unit)}</AppText>
                    <AppText variant="caption" color="muted">{wUnit}</AppText>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {(() => {
                      const delta = weightStats?.change_7d ?? 0
                      if (delta === 0) return <AppText variant="caption" color="muted">7d · no change</AppText>
                      return (
                        <Text className="text-xs" style={{ color: delta < 0 ? brand.successSoft : brand.errorSoft, fontVariant: ['tabular-nums'] }}>
                          7d · {delta < 0 ? '↓' : '↑'}{Math.abs(displayWeight(delta, unit))} {wUnit}
                        </Text>
                      )
                    })()}
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-500">
                      <Plus size={16} color="#fff" />
                    </View>
                  </View>
                </View>
                {weightLogs.length >= 2 ? (
                  <View onLayout={(e) => setSparkWidth(e.nativeEvent.layout.width)}>
                    <WeightSparkline data={sparkData} width={sparkWidth} unit={wUnit} height={48} />
                  </View>
                ) : null}
              </Pressable>
            )}
          </Card>
        </View>
      </ScrollView>

      <QuickWeighInSheet
        open={sheetOpen}
        lastValue={weightLogs[0] ? displayWeight(weightLogs[0].weight, unit) : null}
        lastLog={weightLogs[0] ?? null}
        onClose={() => setSheetOpen(false)}
        onSuccess={(log) => {
          setWeightLogs((prev) =>
            [log, ...prev].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())
          )
          client.weightAPI.stats().then(setWeightStats).catch(() => {})
        }}
      />
    </Screen>
  )
}
