import { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronRight, Dumbbell, Plus, SearchX } from '../ui/icons'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import {
  EXERCISE_PAGE_SIZE, EXERCISE_SEARCH_DEBOUNCE_MS,
  activeFilterCount, emptyFilters, exerciseBrowseFiltered, exerciseBrowseParams, exerciseCatalogEmpty, exerciseNameFromQuery,
  exerciseFilterGroups, hasEquipmentToShow, setFilter, useTranslation,
  type Exercise, type FilterValues,
} from '@lyftr/shared'
import {
  ActiveFilters, AppText, Button, EmptyState, ErrorState, FilterButton, FilterSheet, IconButton,
  PageHeader, SearchField, Skeleton, interactive, linkProps, scrollBleed, useCardGrid,
} from '../ui'
import { client } from '../../lib/lyftr'
import { useMyExercises } from '../../hooks/useMyExercises'
import { useServerInfiniteList } from '../../hooks/useServerInfiniteList'
import { useTheme } from '../../theme/useTheme'
import { equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'
import { useSessionPillInset } from './SessionPill'
import { CustomBadge } from './CustomBadge'
import { CustomExerciseSheet } from './CustomExerciseSheet'
import { MyExercisesRetry } from './MyExercisesRetry'

// The custom group above the catalog: this many rows at most, and past it a "See all" row.
const MY_GROUP_FETCH = 6
const MY_GROUP_SHOWN = 5

const exercisePath = (id: number) => `/workouts/exercise/${id}`
const exerciseHref = (id: number) => exercisePath(id) as unknown as Href

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

// In the wide grid a row is a card of its own: a hairline between cells reads as nothing.
// Memoised: a keystroke in the search box re-rendered every row (~240) before.
const BrowseRow = memo(function BrowseRow({ exercise, card = false }: { exercise: Exercise; card?: boolean }) {
  useTranslation() // re-renders on a language switch: the labels below come from the catalog
  const { colors } = useTheme()
  return (
    <Pressable
      {...linkProps(exercisePath(exercise.id), () => router.push(exerciseHref(exercise.id)))}
      className={`flex-row items-center gap-3 px-3 py-3 active:bg-surface-muted/60 ${card
        ? `rounded-xl border border-surface-border bg-surface-raised motion-safe:transition-colors motion-safe:duration-[120ms] ${interactive('hover:border-brand-500/40')}`
        : interactive('hover:bg-surface-muted/60', { inset: true })}`}
    >
      <ExerciseImage url={exercise.image_url} photo={{ exerciseId: exercise.id, photoId: exercise.photo_id }} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <AppText variant="subheading" numberOfLines={1} className="shrink">{exercise.name}</AppText>
          {exercise.is_custom ? <CustomBadge /> : null}
        </View>
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
})

// Module-level so a render does not make a new component type, which rebuilt every separator
// on each keystroke.
const RowSeparator = memo(function RowSeparator() {
  return <View className="ml-[56px] h-px bg-surface-border/60" />
})
const GridGap = memo(function GridGap() {
  return <View className="h-3" />
})

function GroupHeading({ children }: { children: string }) {
  return (
    <AppText variant="label" color="muted" className="mb-1 mt-2 px-3 uppercase" accessibilityRole="header">
      {children}
    </AppText>
  )
}

// Read-only catalogue, reached from the Workouts tab: look an exercise up and open its page
// without starting a workout. Same server-paged list as the picker, minus the add step, plus
// the muscle and equipment filters the API already takes, behind a filter button.
export function ExerciseBrowser({ initialQuery = '', initialFilters }: { initialQuery?: string; initialFilters?: FilterValues } = {}) {
  const pillInset = useSessionPillInset()
  const { t } = useTranslation()
  const { accent } = useTheme()
  const grid = useCardGrid({ lg: 2, xl: 3 })
  const { wide, cellStyle } = grid
  const renderRow = useCallback(
    ({ item }: { item: Exercise }) => (wide ? <View style={cellStyle}><BrowseRow exercise={item} card /></View> : <BrowseRow exercise={item} />),
    [wide, cellStyle],
  )
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [filters, setFilters] = useState<FilterValues>(() => initialFilters ?? emptyFilters(exerciseFilterGroups({ includeMine: true })))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // Whether the user has any custom exercise at all, whatever the search: it decides whether
  // "Custom only" is offered in the filter sheet.
  const anyMine = useMyExercises({}, 1)
  const { muscle, equipment, show } = filters
  const groups = exerciseFilterGroups({ includeMine: anyMine.supported && (anyMine.items.length > 0 || show === 'mine') })
  const count = activeFilterCount(groups, filters)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // On web the URL carries the search and filters, so reload and Back from an exercise restore
  // them (the route seeds from it). setParams replaces the history entry rather than pushing, so
  // Back leaves the page instead of stepping through filter states. The box and the URL change
  // together; only the request waits out the debounce, or opening an exercise inside that
  // window would drop the search. Native has no URL and stays as it was.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    router.setParams({ q: query.trim() || undefined, muscle: muscle ?? undefined, equipment: equipment ?? undefined, show: show ?? undefined })
  }, [query, muscle, equipment, show])

  const filtered = exerciseBrowseFiltered({ query: debouncedQuery, muscle, equipment })
  const browseParams = exerciseBrowseParams({ query: debouncedQuery, muscle, equipment })
  const my = useMyExercises(browseParams, MY_GROUP_FETCH)
  const supported = my.supported
  // A server without custom exercises has no mine=true; the filter can only apply if it is there.
  const mineOn = supported && show === 'mine'
  const mineReload = () => { my.reload(); anyMine.reload() }

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.exerciseAPI
        .list({ ...browseParams, ...(mineOn ? { mine: true } : {}), page: offset / limit + 1 })
        .then((data) => data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedQuery, muscle, equipment, mineOn]
  )

  const {
    items: exercises, loadMore, hasMore, loading, initialLoading, refreshing, staleResults,
    error: listError, retry: retryList, reload,
  } = useServerInfiniteList<Exercise>({
    fetcher,
    pageSize: EXERCISE_PAGE_SIZE,
    deps: [debouncedQuery, muscle, equipment, mineOn],
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
  const openExercise = (e: Exercise) => router.push(exerciseHref(e.id))
  const myGroup = mineOn ? [] : my.items
  const myShown = myGroup.length >= MY_GROUP_FETCH ? myGroup.slice(0, MY_GROUP_SHOWN) : myGroup
  const hasMyGroup = myShown.length > 0
  const changeFilter = (key: string, value: string | null) => setFilters((f) => setFilter(f, key, value))

  const content = (
    <>
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-3">
        <IconButton icon={ArrowLeft} label={t('exercises.browse.backToWorkouts')} variant="ghost" size="md" onPress={goBack} />
        <View className="flex-1">
          <PageHeader
            title={t('exercises.browse.title')}
            subtitle={t('exercises.browse.subtitle')}
            action={supported ? (
              <IconButton icon={Plus} label={t('exercises.custom.add')} variant="solid" size="md" onPress={() => setCreating(true)} />
            ) : undefined}
          />
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

      {supported ? (
        <CustomExerciseSheet
          open={creating}
          mode="create"
          submitLabel="create"
          initialName={exerciseNameFromQuery(query)}
          onSaved={(e) => { setCreating(false); mineReload(); void reload(); openExercise(e) }}
          onUseExisting={(e) => { setCreating(false); openExercise(e) }}
          onClose={() => setCreating(false)}
        />
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
        // flex in style, not className: on web the className never reached Reanimated's View, so
        // the list grew to its content, never scrolled, and paged in the whole catalogue.
        <Animated.View style={[{ flex: 1 }, fade]}>
          <FlatList
            key={grid.key}
            numColumns={grid.numColumns}
            columnWrapperStyle={grid.columnWrapperStyle}
            style={grid.wide ? scrollBleed : undefined}
            data={shown}
            keyExtractor={(e) => String(e.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 + pillInset }}
            ItemSeparatorComponent={grid.wide ? GridGap : RowSeparator}
            renderItem={renderRow}
            ListHeaderComponent={!mineOn && my.failed ? (
              <View className="pb-2"><MyExercisesRetry onRetry={my.reload} /></View>
            ) : hasMyGroup ? (
              <View className="pb-2">
                <GroupHeading>{t('exercises.custom.yours')}</GroupHeading>
                {myShown.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <RowSeparator /> : null}
                    <BrowseRow exercise={e} />
                  </View>
                ))}
                {myGroup.length >= MY_GROUP_FETCH ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => changeFilter('show', 'mine')}
                    className={`min-h-[44px] flex-row items-center justify-between px-3 py-2 active:bg-surface-muted/60 ${interactive('hover:bg-surface-muted/60', { inset: true })}`}
                  >
                    <AppText variant="bodySemibold" style={{ color: accent }}>{t('exercises.custom.seeAllMine')}</AppText>
                    <ChevronRight size={16} color={accent} />
                  </Pressable>
                ) : null}
                <GroupHeading>{t('exercises.custom.catalog')}</GroupHeading>
              </View>
            ) : undefined}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              // "No exercises found" is only true if we heard back; on a failed fetch it would
              // read as an empty catalogue rather than a connection that dropped.
              listError ? (
                <ErrorState title={t('exercises.picker.loadFailed')} message={listError} onRetry={retryList} />
              ) : hasMyGroup ? <View /> : mineOn ? (
                <EmptyState
                  compact
                  icon={SearchX}
                  title={filtered ? t('exercises.custom.mineNoMatchTitle') : t('exercises.custom.mineEmptyTitle')}
                  subtitle={filtered ? undefined : t('exercises.custom.mineEmptyBody')}
                  action={count > 0
                    ? <Button variant="secondary" title={t('filters.reset')} onPress={resetFilters} />
                    : undefined}
                />
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
                  <ActivityIndicator color={accent} accessibilityLabel={Platform.OS === 'web' ? t('common.loadingMore') : undefined} />
                  <AppText variant="caption" color="muted">{t('common.loadingMore')}</AppText>
                </View>
              ) : undefined
            }
          />
        </Animated.View>
      )}
    </>
  )

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {grid.wide ? <View className="mx-auto w-full max-w-6xl flex-1">{content}</View> : content}
    </SafeAreaView>
  )
}
