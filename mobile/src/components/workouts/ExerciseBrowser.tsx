import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Dumbbell } from 'lucide-react-native'
import {
  EXERCISE_FILTER_EQUIPMENT, EXERCISE_FILTER_MUSCLES,
  exerciseBrowseFiltered, exerciseBrowseParams, exerciseCatalogEmpty, hasEquipmentToShow,
  useTranslation, type Exercise,
} from '@lyftr/shared'
import { AppText, Button, EmptyState, ErrorState, IconButton, SearchField } from '../ui'
import { client } from '../../lib/lyftr'
import { useServerInfiniteList } from '../../hooks/useServerInfiniteList'
import { useTheme } from '../../theme/useTheme'
import { equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'

// Must match the server's default page size: a short page is what tells us there
// is nothing left for this query.
const PAGE_SIZE = 50
const DEBOUNCE_MS = 250

const exerciseHref = (id: number) => `/workouts/exercise/${id}` as unknown as Href

function ChipRow({ label, options, value, onChange, labelOf }: {
  label: string
  options: readonly string[]
  value: string | null
  onChange: (next: string | null) => void
  labelOf: (slug: string) => string
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
    >
      {options.map((slug) => {
        const on = value === slug
        return (
          <Pressable
            key={slug}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on ? null : slug)}
            className={`rounded-full border px-3 py-1.5 ${
              on ? 'border-brand-500/40 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
            }`}
          >
            <AppText variant="caption" color={on ? 'brand' : 'muted'} className="capitalize">
              {labelOf(slug)}
            </AppText>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function BrowseRow({ exercise }: { exercise: Exercise }) {
  useTranslation() // re-renders on a language switch: the labels below come from the catalog
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
    </Pressable>
  )
}

// Read-only catalogue, reached from the Workouts tab: look an exercise up and open its page
// without starting a workout. Same server-paged list as the picker, minus the add step, plus
// the muscle and equipment filters the API already takes.
export function ExerciseBrowser() {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
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
    items: exercises, loadMore, hasMore, loading, initialLoading, error: listError, retry: retryList, reload,
  } = useServerInfiniteList<Exercise>({
    fetcher,
    pageSize: PAGE_SIZE,
    deps: [debouncedQuery, muscle, equipment],
  })

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-3">
        <IconButton icon={ArrowLeft} label={t('exercises.browse.backToWorkouts')} variant="ghost" size="md" onPress={goBack} />
        <View className="flex-1">
          <AppText variant="title">{t('exercises.browse.title')}</AppText>
          <AppText variant="caption" color="muted">{t('exercises.browse.subtitle')}</AppText>
        </View>
      </View>

      <View className="px-4 pb-3">
        <SearchField value={query} onChangeText={setQuery} placeholder={t('exercises.picker.search')} />
      </View>

      <View className="gap-2 pb-2">
        <ChipRow
          label={t('exercises.browse.muscle')}
          options={EXERCISE_FILTER_MUSCLES}
          value={muscle}
          onChange={setMuscle}
          labelOf={muscleLabel}
        />
        <ChipRow
          label={t('exercises.browse.equipment')}
          options={EXERCISE_FILTER_EQUIPMENT}
          value={equipment}
          onChange={setEquipment}
          labelOf={equipmentLabel}
        />
        {muscle || equipment ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => { setMuscle(null); setEquipment(null) }}
            className="px-4"
          >
            <AppText variant="caption" color="brand">{t('exercises.browse.clearFilters')}</AppText>
          </Pressable>
        ) : null}
      </View>

      {initialLoading ? (
        <View className="flex-row items-center justify-center gap-2 py-16">
          <ActivityIndicator color={accent} />
          <AppText variant="body" color="muted">{t('exercises.picker.loading')}</AppText>
        </View>
      ) : (
        <FlatList
          data={exercises}
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
              <View className="items-center py-16">
                <AppText variant="body" color="muted">
                  {filtered ? t('exercises.browse.noMatch') : t('exercises.picker.empty')}
                </AppText>
              </View>
            )
          }
          ListFooterComponent={
            listError && exercises.length > 0 ? (
              <ErrorState title={t('exercises.picker.loadMoreFailed')} message={listError} onRetry={retryList} />
            ) : hasMore && exercises.length > 0 ? (
              <View className="flex-row items-center justify-center gap-2 py-4">
                <ActivityIndicator color={accent} />
                <AppText variant="caption" color="muted">{t('common.loadingMore')}</AppText>
              </View>
            ) : undefined
          }
        />
      )}
    </SafeAreaView>
  )
}
