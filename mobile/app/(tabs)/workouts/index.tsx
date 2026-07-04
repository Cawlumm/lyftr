import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Dumbbell, Plus } from 'lucide-react-native'
import { weightShort, type Workout } from '@lyftr/shared'
import { AppText, Card, EmptyState, Field, IconButton, Label, Loading, PageHeader, Screen } from '../../../src/components/ui'
import { WorkoutCard } from '../../../src/components/workouts/WorkoutCard'
import { useServerInfiniteList } from '../../../src/hooks/useServerInfiniteList'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

export default function Workouts() {
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const unit = weightShort(settings.weight_unit)
  const { accent } = useTheme()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // TODO(phase-2, #40): show the progression Toast here when arriving from a finished
  // session (web reads router state; mobile will use a router param or the
  // workoutSession store). Deliberately NOT built in phase 1a.

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Debounce search so we don't fire a request on every keystroke (1:1 with web).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.workoutAPI.list({ offset, limit, q: debouncedSearch || undefined }),
    [debouncedSearch]
  )
  const { items: workouts, loadMore, hasMore, loading, initialLoading, reload } =
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

  if (initialLoading) return <Loading />


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

            {/* Summary — web's 3-card grid */}
            <View className="flex-row gap-3">
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

            {/* Search — Field has no leading-icon slot; the web's inline Search icon
                is deferred to polish rather than forking the primitive. */}
            <Field
              value={search}
              onChangeText={setSearch}
              placeholder="Search workouts…"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        }
        renderItem={({ item }) => (
          <WorkoutCard
            workout={item}
            unit={unit}
            onPress={() => router.push(`/workouts/${item.id}`)}
            onDeleted={() => reload()}
          />
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
    </Screen>
  )
}
