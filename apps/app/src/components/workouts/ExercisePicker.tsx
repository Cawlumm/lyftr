import { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useStableCallback } from '../../hooks/useStableCallback'
import { ArrowLeft, Dumbbell, Search } from '../ui/icons'
import { exerciseCatalogEmpty, hasEquipmentToShow, EXERCISE_PAGE_SIZE, EXERCISE_SEARCH_DEBOUNCE_MS, useTranslation, type Exercise } from '@lyftr/shared'
import { AppText, Button, EmptyState, ErrorState, IconButton } from '../ui'
import { FIELD_FOCUS_RING, NO_INPUT_OUTLINE } from '../ui/interaction'
import { client } from '../../lib/lyftr'
import { useServerInfiniteList } from '../../hooks/useServerInfiniteList'
import { useTheme } from '../../theme/useTheme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'

interface Props {
  selectedIds: number[]
  onSelect: (exercise: Exercise) => void
  onClose: () => void
}


// Memoised with a stable onSelect: a keystroke in the search box re-rendered every row (~180)
// and rebuilt every separator, during a live workout.
const PickerRow = memo(function PickerRow({ exercise, onSelect }: { exercise: Exercise; onSelect: (exercise: Exercise) => void }) {
  useTranslation() // re-renders on a language switch: the labels below come from the catalog
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(exercise)}
      className="flex-row items-center gap-3 px-3 py-3 active:bg-surface-muted/60"
    >
      <ExerciseImage url={exercise.image_url} />
      <View className="flex-1">
        <AppText variant="subheading" numberOfLines={1}>{exercise.name}</AppText>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
          {/* Neutral muscle chip: a whole scrolling list of loud per-muscle colors
              reads busy and there's no "best"/PR signal here to reserve color for —
              keep the taxonomy legible but let the exercise name be the hero. */}
          <View className="rounded border border-surface-border bg-surface-muted px-1.5 py-0.5">
            <AppText variant="caption" color="muted" className="capitalize">
              {muscleLabel(exercise.muscle_group)}
            </AppText>
          </View>
          {hasEquipmentToShow(exercise.equipment) ? (
            <AppText variant="caption" color="muted">
              {equipmentLabel(exercise.equipment)}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
})

// A module-level component: an inline one is a new type every render, so React rebuilt every
// separator on each keystroke.
const RowSeparator = memo(function RowSeparator() {
  return <View className="ml-[56px] h-px bg-surface-border/60" />
})

// Port of web/components/ExercisePicker.tsx as a full-screen RN Modal (the web
// portals a fixed overlay; the caller conditionally mounts us the same way, so
// search state resets per open — a routed screen can't hand the picked Exercise
// back to the form without a store detour, hence Modal).
export function ExercisePicker({ selectedIds, onSelect, onClose }: Props) {
  const select = useStableCallback(onSelect)
  const renderRow = useCallback(({ item }: { item: Exercise }) => <PickerRow exercise={item} onSelect={select} />, [select])
  const { t } = useTranslation()
  const { accent, colors } = useTheme()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Every page comes from the server, which queries open-exercise-db. The client
  // used to cache the whole unfiltered catalog on first open and slice it locally;
  // that made each install a copy of a database it does not own, and on a phone it
  // is the difference between one 50-row response and ~873 rows of JSON.
  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.exerciseAPI
        .list({ ...(debouncedQuery ? { q: debouncedQuery } : {}), page: offset / limit + 1 })
        .then((data) => data ?? []),
    [debouncedQuery]
  )

  const {
    items: exercises, loadMore, hasMore, loading, initialLoading, error: listError, retry: retryList, reload,
  } = useServerInfiniteList<Exercise>({
    fetcher,
    pageSize: EXERCISE_PAGE_SIZE,
    deps: [debouncedQuery],
  })

  const available = exercises.filter((e) => !selectedIds.includes(e.id))
  // From lg on web a centred panel over the dimmed app, like gym mode (GymFrame.web), rather
  // than a phone screen stretched across the desktop and over the sidebar.
  const { lg } = useBreakpoint()
  const panel = Platform.OS === 'web' && lg

  return (
    <Modal visible transparent={panel} animationType={panel ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View className={panel ? 'flex-1 items-center justify-center bg-black/60 p-6' : 'flex-1'}>
      <View className={panel ? 'h-full max-h-[56rem] w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-border bg-surface-base shadow-2xl' : 'flex-1'}>
      {/* A Modal renders in its own native view hierarchy outside the app's
          SafeAreaProvider, so SafeAreaView's top inset resolves to 0 there and the
          header rides up under the status bar/notch. Nest a provider inside the modal
          so insets are re-measured for its window (the documented RN fix). */}
      <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-surface-border px-4 pb-4 pt-3">
          <IconButton icon={ArrowLeft} label={t('exercises.picker.close')} variant="ghost" size="md" onPress={onClose} />
          <View>
            {/* Large title (matches the sibling "Log Workout" screen title) — the
                18px heading read undersized for a full-screen surface. */}
            <AppText variant="title" headingLevel={2}>{t('exercises.picker.title')}</AppText>
            {/* Only true if the fetch landed — on a failure this read "0 loaded"
                above a message saying we could not load anything. */}
            {listError ? null : (
              <AppText variant="caption" color="muted">
                {t(hasMore ? 'exercises.picker.loadedMore' : 'exercises.picker.loaded', { count: available.length })}
              </AppText>
            )}
          </View>
        </View>

        {/* Search — local composed input (not the shared Field, which has no leading
            slot) so the magnifier icon reads as a native search bar. Same value/
            onChangeText/behavior as before; only the chrome changed. */}
        <View className="border-b border-surface-border px-4 py-3">
          <View
            className={`flex-row items-center gap-2.5 rounded-xl border border-surface-border px-3.5 ${FIELD_FOCUS_RING}`}
            style={{ minHeight: 48, backgroundColor: colors.overlay }}
          >
            <Search size={18} color={colors.txMuted} strokeWidth={2.2} />
            <TextInput
              className="flex-1 font-sans text-base text-tx-primary"
              style={NO_INPUT_OUTLINE}
              value={query}
              onChangeText={setQuery}
              placeholder={t('exercises.picker.search')}
              placeholderTextColor={colors.txMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        </View>

        {/* List */}
        {initialLoading ? (
          <View className="flex-row items-center justify-center gap-2 py-16">
            <ActivityIndicator color={accent} />
            <AppText variant="body" color="muted">{t('exercises.picker.loading')}</AppText>
          </View>
        ) : (
          <FlatList
            data={available}
            keyExtractor={(e) => String(e.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
            // Inset hairline between rows (native list idiom): starts past the leading
            // media so the thumbnails read as a column, not boxed cells.
            ItemSeparatorComponent={RowSeparator}
            renderItem={renderRow}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              // "No exercises found" is only true if we heard back. On a failed fetch
              // it reads as an empty catalogue rather than a connection that dropped.
              listError ? (
                <ErrorState title={t('exercises.picker.loadFailed')} message={listError} onRetry={retryList} />
              ) : exerciseCatalogEmpty(debouncedQuery, { items: exercises, hasMore, error: listError }) ? (
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
                  <AppText variant="body" color="muted">{t('exercises.picker.empty')}</AppText>
                </View>
              )
            }
            ListFooterComponent={
              // A later page failing under rows that did arrive: without this the list
              // just stops, which reads as the end of the catalogue.
              // Keyed on the rows actually listed, not on what loaded: with every loaded
              // exercise already selected the list is empty, and the slot above would
              // render the same failure a second time.
              listError && available.length > 0 ? (
                <ErrorState title={t('exercises.picker.loadMoreFailed')} message={listError} onRetry={retryList} />
              ) : hasMore && available.length > 0 ? (
                <View className="flex-row items-center justify-center gap-2 py-4">
                  <ActivityIndicator color={accent} />
                  <AppText variant="caption" color="muted">{t('common.loadingMore')}</AppText>
                </View>
              ) : undefined
            }
          />
        )}
      </SafeAreaView>
      </SafeAreaProvider>
      </View>
      </View>
    </Modal>
  )
}
