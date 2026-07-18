import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native'
import { router, useFocusEffect, type Href } from 'expo-router'
import { Award, CheckCircle2, Dumbbell, Plus, RotateCcw, TrendingUp } from 'lucide-react-native'
import { weightShort, type Workout } from '@lyftr/shared'
import { AppText, Card, EmptyState, IconButton, Label, PageHeader, Screen, SearchField, Toast } from '../../../src/components/ui'
import { WorkoutCard } from '../../../src/components/workouts/WorkoutCard'
import { WorkoutsSkeleton } from '../../../src/components/workouts/WorkoutsSkeleton'
import { useServerInfiniteList } from '../../../src/hooks/useServerInfiniteList'
import { client, useSettingsStore, useWorkoutSession } from '../../../src/lib/lyftr'
import { useWorkoutOutcome } from '../../../src/lib/workoutOutcome'
import { useTheme } from '../../../src/theme/useTheme'

// Cross-tab jump (workouts → programs), same rule as programs/[id]'s handleStart:
// router.navigate, not push, or it corrupts the native tab/back stack.
const programHref = (id: number) => `/programs/${id}` as unknown as Href

export default function Workouts() {
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const unit = weightShort(settings.weight_unit)
  const { accent } = useTheme()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Confirmation toast on arrival from a finished/discarded session (the courier is the
  // one-shot useWorkoutOutcome store, set during teardown before we navigate here).
  const outcome = useWorkoutOutcome((s) => s.outcome)
  const clearOutcome = useWorkoutOutcome((s) => s.clear)
  const restoreSession = useWorkoutSession((s) => s.restoreSession)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Debounce search so we don't fire a request on every keystroke. 250ms sits in the
  // research-backed 200–300ms sweet spot (>300ms starts to feel laggy).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.workoutAPI.list({ offset, limit, q: debouncedSearch || undefined }),
    [debouncedSearch]
  )
  const { items: workouts, loadMore, hasMore, loading, initialLoading, refreshing, reload } =
    useServerInfiniteList<Workout>({ fetcher, deps: [debouncedSearch] })

  // The stack keeps this screen mounted under the detail screen, so a delete made
  // there doesn't remount us the way the web SPA's re-navigation does — refetch on
  // re-focus instead. Skip the first focus: the hook's deps-effect already fetched.
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true
        return
      }
      reload()
    }, [reload])
  )

  // Pull-to-refresh: drive the native RefreshControl spinner off the reload promise.
  const [pulling, setPulling] = useState(false)
  const onPullRefresh = useCallback(async () => {
    setPulling(true)
    await reload()
    setPulling(false)
  }, [reload])

  // Skeleton (not the barbell loader) for the list's first load: content-shaped
  // placeholders read as faster and match where the real cards will land.
  if (initialLoading) return <WorkoutsSkeleton />


  const now = new Date()
  const stats = [
    // 1:1 with web: these summarize the *loaded* items, not a server-side stat.
    { label: 'Total', value: String(workouts.length), unit: 'logged' },
    {
      label: 'This Month',
      value: String(workouts.filter((w) => new Date(w.started_at).getMonth() === now.getMonth()).length),
      unit: 'sessions',
    },
    {
      label: 'Avg Time',
      value:
        workouts.length > 0
          ? String(Math.round(workouts.reduce((sum, w) => sum + w.duration, 0) / workouts.length / 60))
          : '0',
      unit: 'min',
    },
  ]

  return (
    <Screen>
      <FlatList
        data={workouts}
        keyExtractor={(w) => String(w.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // IntersectionObserver-sentinel replacement: fetch the next page as the user
        // nears the end (threshold 0.5 ≈ the web's 200px rootMargin pre-fetch).
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={accent} colors={[accent]} />
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="gap-5 py-4">
            <PageHeader
              title="Workouts"
              subtitle="Track and review your training sessions"
              action={
                <IconButton
                  icon={Plus}
                  label="Log Workout"
                  variant="solid"
                  size="md"
                  onPress={() => router.push('/workouts/new')}
                />
              }
            />

            {/* Summary — web's 3-card grid. Dimmed while a new search revalidates: the
                stats summarize the loaded items, so they're stale mid-search — fading
                them (and the rows below) signals "updating" without a blank flash. */}
            <View className="flex-row gap-3" style={{ opacity: refreshing ? 0.5 : 1 }}>
              {/* Tighter horizontal padding than Card's default: three-up columns are
                  narrow and the uppercase wide-tracked label truncates at p-4. */}
              {stats.map((s) => (
                <Card key={s.label} className="flex-1 rounded-2xl" style={{ paddingHorizontal: 12 }}>
                  <Label className="mb-2" numberOfLines={1}>{s.label}</Label>
                  <View className="flex-row items-end gap-1">
                    <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                      {s.value}
                    </AppText>
                    <AppText variant="caption" color="muted" className="mb-0.5" numberOfLines={1}>
                      {s.unit}
                    </AppText>
                  </View>
                </Card>
              ))}
            </View>

            {/* Reusable SearchField: leading search icon + a trailing slot that is a
                spinner while a new query fetches (previous results stay on screen and
                swap in place — no flash-to-zero) or a clear (×) button once there's text. */}
            <SearchField
              value={search}
              onChangeText={setSearch}
              loading={refreshing}
              placeholder="Search workouts…"
            />
          </View>
        }
        renderItem={({ item }) => (
          // Fade the stale rows while a new search revalidates (they swap in place when
          // the fresh page lands); the search field above stays full-opacity/interactive.
          <View style={{ opacity: refreshing ? 0.5 : 1 }}>
            <WorkoutCard
              workout={item}
              unit={unit}
              onPress={() => router.push(`/workouts/${item.id}`)}
              onDeleted={() => reload()}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={Dumbbell}
              title="No workouts found"
              subtitle={search ? 'Try a different search' : 'Log a workout to get started'}
            />
          )
        }
        ListFooterComponent={
          hasMore && loading && workouts.length > 0 ? (
            <View className="items-center py-3">
              <ActivityIndicator size="small" color={accent} />
            </View>
          ) : null
        }
      />

      {/* Post-session confirmation. Saved = quiet success; discarded = tap-to-undo
          (restores the exact session snapshot and drops you back into it). */}
      {outcome ? (
        outcome.kind === 'saved' ? (
          outcome.progression ? (
            <Toast
              variant={outcome.progression.is_pr ? 'warning' : 'success'}
              icon={outcome.progression.is_pr ? Award : TrendingUp}
              title={outcome.progression.is_pr ? `New PR in ${outcome.progression.program_name}` : `New targets in ${outcome.progression.program_name}`}
              description={`Tap to review ${outcome.progression.count} ${outcome.progression.count === 1 ? 'update' : 'updates'}`}
              onPress={() => {
                const programId = outcome.progression!.program_id
                clearOutcome()
                router.navigate(programHref(programId))
              }}
              onDismiss={clearOutcome}
            />
          ) : (
            <Toast
              variant="success"
              icon={CheckCircle2}
              title="Workout saved"
              description="Tap to view"
              onPress={() => {
                clearOutcome()
                router.push(`/workouts/${outcome.workoutId}`)
              }}
              onDismiss={clearOutcome}
            />
          )
        ) : (
          <Toast
            variant="default"
            icon={RotateCcw}
            title="Workout discarded"
            description="Tap to undo"
            onPress={() => {
              restoreSession(outcome.session)
              clearOutcome()
              router.push('/workouts/active')
            }}
            onDismiss={clearOutcome}
          />
        )
      ) : null}
    </Screen>
  )
}
