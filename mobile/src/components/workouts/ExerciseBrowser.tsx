import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronRight, Dumbbell, SearchX } from 'lucide-react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import {
  EXERCISE_PAGE_SIZE, EXERCISE_SEARCH_DEBOUNCE_MS,
  activeFilterCount, emptyFilters, exerciseBrowseFiltered, exerciseBrowseParams, exerciseCatalogEmpty,
  exerciseFilterGroups, hasEquipmentToShow, setFilter, useTranslation,
  type Exercise, type FilterValues,
} from '@lyftr/shared'
import {
  ActiveFilters, AppText, Button, EmptyState, ErrorState, FilterButton, FilterSheet, IconButton,
  PageHeader, SearchField, Skeleton,
} from '../ui'
import { client } from '../../lib/lyftr'
import { useServerInfiniteList } from '../../hooks/useServerInfiniteList'
import { useTheme } from '../../theme/useTheme'
import { equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'

const exerciseHref = (id: number) => `/workouts/exercise/${id}` as unknown as Href

// Row-shaped placeholders for the first load, so the list fills in rather than popping in
// after a spinner. Same thumbnail size and two text lines as BrowseRow.
function BrowseSkeleton() {
  return (
    <View className="px-4 py-2">
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-3 py-3">
          <Skeleton width={44} height={44} radius={12} />
          <View className="flex-1 gap-2">
            <Skeleton width="65%" height={14} />
            <Skeleton width="35%" height={11} />
          </View>
        </View>
      ))}
    </View>
  )
}

function BrowseRow({ exercise }: { exercise: Exercise }) {
  useTranslation() // re-renders on a language switch: the labels below come from the catalog
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(exerciseHref(exercise.id))}
      className="flex-row items-center gap-3 px-3 py-3 active:bg-surface-muted/60"
    >
      <ExerciseImage url={exercise.image_url} />
      <View className="flex-1">
        <AppText variant="subheading" numberOfLines={1}>{exercise.name}</AppText>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
          <View className="rounded border border-surface-border bg-surface-muted px-1.5 py-0.5">
            <AppText variant="caption" color="muted" className="capitalize">
              {muscleLabel(exercise.muscle_group)}
            </AppText>
          </View>
          {hasEquipmentToShow(exercise.equipment) ? (
            <AppText variant="caption" color="muted">{equipmentLabel(exercise.equipment)}</AppText>
          ) : null}
        </View>
      </View>
      <ChevronRight size={16} color={colors.txMuted} />
    </Pressable>
  )
}

// Read-only catalogue, reached from the Workouts tab: look an exercise up and open its page
// without starting a workout. Same server-paged list as the picker, minus the add step, plus
// the muscle and equipment filters the API already takes, behind a filter button.
export function ExerciseBrowser() {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<FilterValues>(() => emptyFilters(exerciseFilterGroups()))
  const [sheetOpen, setSheetOpen] = useState(false)
  const groups = exerciseFilterGroups()
  const { muscle, equipment } = filters
  const count = activeFilterCount(groups, filters)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const filtered = exerciseBrowseFiltered({ query: debouncedQuery, muscle, equipment })

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.exerciseAPI
        .list({ ...exerciseBrowseParams({ query: debouncedQuery, muscle, equipment }), page: offset / limit + 1 })
        .then((data) => data ?? []),
    [debouncedQuery, muscle, equipment]
  )

  const {
    items: exercises, loadMore, hasMore, loading, initialLoading, refreshing, staleResults,
    error: listError, retry: retryList, reload,
  } = useServerInfiniteList<Exercise>({
    fetcher,
    pageSize: EXERCISE_PAGE_SIZE,
    deps: [debouncedQuery, muscle, equipment],
  })

  // Eased rather than snapped, so a fresh query reads as the same list updating.
  const fade = useAnimatedStyle(
    () => ({ opacity: withTiming(refreshing ? 0.5 : 1, { duration: 150 }) }),
    [refreshing],
  )
  const resetFilters = () => setFilters(emptyFilters(groups))
  // The hook keeps the previous query's rows when a new query's first page fails; shown as they
  // are they read as its results, so the failure takes their place.
  const shown = staleResults ? [] : exercises
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))
  const changeFilter = (key: string, value: string | null) => setFilters((f) => setFilter(f, key, value))

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-3">
        <IconButton icon={ArrowLeft} label={t('exercises.browse.backToWorkouts')} variant="ghost" size="md" onPress={goBack} />
        <View className="flex-1">
          <PageHeader title={t('exercises.browse.title')} subtitle={t('exercises.browse.subtitle')} />
        </View>
      </View>

      <View className="flex-row items-center gap-2 px-4 pb-3">
        <View className="flex-1">
          <SearchField value={query} onChangeText={setQuery} placeholder={t('exercises.picker.search')} />
        </View>
        <FilterButton active={count} onPress={() => setSheetOpen(true)} />
      </View>

      {count > 0 ? (
        <View className="pb-2">
          <ActiveFilters groups={groups} values={filters} onRemove={(key) => changeFilter(key, null)} />
        </View>
      ) : null}

      <FilterSheet
        open={sheetOpen}
        groups={groups}
        values={filters}
        onChange={changeFilter}
        onReset={resetFilters}
        onClose={() => setSheetOpen(false)}
      />

      {initialLoading ? (
        <BrowseSkeleton />
      ) : (
        // Fade the stale rows while a new query or filter revalidates (they swap in place when
        // the fresh page lands); the search field and filters above stay interactive.
        <Animated.View className="flex-1" style={fade}>
          <FlatList
            data={shown}
            keyExtractor={(e) => String(e.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
            ItemSeparatorComponent={() => <View className="ml-[56px] h-px bg-surface-border/60" />}
            renderItem={({ item }) => <BrowseRow exercise={item} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              // "No exercises found" is only true if we heard back; on a failed fetch it would
              // read as an empty catalogue rather than a connection that dropped.
              listError ? (
                <ErrorState title={t('exercises.picker.loadFailed')} message={listError} onRetry={retryList} />
              ) : exerciseCatalogEmpty(filtered, { items: exercises, hasMore, error: listError }) ? (
                <EmptyState
                  compact
                  icon={Dumbbell}
                  title={t('exercises.picker.catalogEmpty.title')}
                  subtitle={t('exercises.picker.catalogEmpty.body')}
                  action={
                    <Button
                      variant="secondary"
                      title={loading ? t('common.retrying') : t('common.tryAgain')}
                      onPress={() => { void reload() }}
                      loading={loading}
                    />
                  }
                />
              ) : (
                <EmptyState
                  compact
                  icon={SearchX}
                  title={filtered ? t('exercises.browse.noMatchTitle') : t('exercises.picker.empty')}
                  subtitle={filtered
                    ? (count > 0 ? t('exercises.browse.noMatchBody') : t('common.tryDifferentSearch'))
                    : undefined}
                  action={count > 0
                    ? <Button variant="secondary" title={t('filters.reset')} onPress={resetFilters} />
                    : undefined}
                />
              )
            }
            ListFooterComponent={
              listError && shown.length > 0 ? (
                <ErrorState title={t('exercises.picker.loadMoreFailed')} message={listError} onRetry={retryList} />
              ) : hasMore && shown.length > 0 ? (
                <View className="flex-row items-center justify-center gap-2 py-4">
                  <ActivityIndicator color={accent} />
                  <AppText variant="caption" color="muted">{t('common.loadingMore')}</AppText>
                </View>
              ) : undefined
            }
          />
        </Animated.View>
      )}
    </SafeAreaView>
  )
}
