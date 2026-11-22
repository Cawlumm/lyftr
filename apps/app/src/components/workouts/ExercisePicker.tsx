import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { router, usePathname, type Href } from 'expo-router'
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useStableCallback } from '../../hooks/useStableCallback'
import { ArrowLeft, Dumbbell, Plus, Search } from '../ui/icons'
import { exerciseCatalogEmpty, exerciseNameFromQuery, hasEquipmentToShow, EXERCISE_PAGE_SIZE, EXERCISE_SEARCH_DEBOUNCE_MS, useTranslation, type Exercise } from '@lyftr/shared'
import { AppText, Button, EmptyState, ErrorState, IconButton } from '../ui'
import { FIELD_FOCUS_RING, interactive, NO_INPUT_OUTLINE } from '../ui/interaction'
import { client } from '../../lib/lyftr'
import { requestExerciseCreate } from '../../lib/exerciseCreateRequests'
import { useServerInfiniteList } from '../../hooks/useServerInfiniteList'
import { MAX_CUSTOM_EXERCISES, useMyExercises } from '../../hooks/useMyExercises'
import { useTheme } from '../../theme/useTheme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'
import { CustomBadge } from './CustomBadge'
import { ExerciseGroupHeading } from './ExerciseGroupHeading'
import { MyExercisesRetry } from './MyExercisesRetry'

interface Props {
  selectedIds: number[]
  onSelect: (exercise: Exercise) => void
  onClose: () => void
  /** Header text; the merge flow names its own. */
  title?: string
  /** Says what the pick is for, under the title (the merge picker: which one stays). */
  subtitle?: string
  /** Offer "Create <query>" (and the caller's own exercises). Off for the merge target picker. */
  allowCreate?: boolean
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
      <ExerciseImage url={exercise.image_url} photo={{ exerciseId: exercise.id, photoId: exercise.photo_id }} />
      <View className="flex-1">
        <AppText variant="subheading" numberOfLines={1}>{exercise.name}</AppText>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
          {exercise.is_custom ? <CustomBadge /> : null}
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

// "Create <query>": first row of the list, so it is one tap away with results on screen or none.
const CreateRow = memo(function CreateRow({ name, onPress }: { name: string; onPress: () => void }) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('exercises.custom.createRowLabel', { name })}
      onPress={onPress}
      style={{ minHeight: 64 }}
      className={`mb-2 flex-row items-center gap-3 rounded-xl border-[1.5px] border-dashed border-brand-500 bg-brand-500/10 px-3 py-3 active:opacity-70 ${interactive('hover:bg-brand-500/15')}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15">
        <Plus size={20} color={accent} strokeWidth={2.4} />
      </View>
      <View className="flex-1">
        <AppText variant="subheading" numberOfLines={2}>{t('exercises.custom.createRow', { name })}</AppText>
        <AppText variant="caption" color="muted">{t('exercises.custom.createRowHint')}</AppText>
      </View>
    </Pressable>
  )
})

export function ExercisePicker({ selectedIds, onSelect, onClose, title, subtitle, allowCreate = true }: Props) {
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

  // All of yours, as the server caps them (stores.MaxCustomExercises): the merge target is picked
  // from this list, and one past a cut would be reachable only by searching for it.
  const mine = useMyExercises({ q: debouncedQuery }, MAX_CUSTOM_EXERCISES)
  // Your own exercises are listed even where Create is not offered: merging one duplicate of
  // yours into another is the commonest merge there is.
  const myRows = useMemo(
    () => (mine.supported ? mine.items.filter((e) => !selectedIds.includes(e.id)) : []),
    [mine.supported, mine.items, selectedIds],
  )
  const typed = query.trim()
  const showCreate = allowCreate && mine.supported && [...typed].length >= 2
  const createName = exerciseNameFromQuery(typed)
  // The create page lives in the tab the picker was opened from, so Back stays in that stack.
  const base = usePathname().startsWith('/programs') ? '/programs' : '/workouts'
  // The picker is an RN Modal and must be gone before the route changes, or the page would open
  // underneath it. What the caller does with the created exercise is parked with the request
  // and run by the page on save, exactly as for a pick.
  const openCreate = useCallback(() => {
    const request = requestExerciseCreate(select)
    onClose()
    router.push({ pathname: `${base}/exercise/new`, params: { name: createName, request } } as unknown as Href)
  }, [select, onClose, base, createName])
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
          <View className="flex-1">
            {/* Large title (matches the sibling "Log Workout" screen title) — the
                18px heading read undersized for a full-screen surface. A caller's title
                carries a name ("Merge “…” into"), so it wraps rather than running off. */}
            <AppText variant="title" headingLevel={2} numberOfLines={2}>{title ?? t('exercises.picker.title')}</AppText>
            {subtitle ? <AppText variant="caption" color="muted">{subtitle}</AppText> : null}
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
            ListHeaderComponent={
              showCreate || myRows.length > 0 || mine.failed ? (
                <View>
                  {showCreate && available.length === 0 && myRows.length === 0 && !mine.failed && !listError ? (
                    <AppText variant="caption" color="muted" className="mb-2 px-1">{t('exercises.picker.noMatch', { query: typed })}</AppText>
                  ) : null}
                  {showCreate ? <CreateRow name={createName} onPress={openCreate} /> : null}
                  {mine.failed ? <MyExercisesRetry onRetry={mine.reload} /> : null}
                  {myRows.length > 0 ? (
                    <View>
                      <ExerciseGroupHeading>{t('exercises.custom.yours')}</ExerciseGroupHeading>
                      {myRows.map((e, i) => (
                        <View key={e.id}>
                          {i > 0 ? <RowSeparator /> : null}
                          <PickerRow exercise={e} onSelect={select} />
                        </View>
                      ))}
                      {available.length > 0 ? (
                        <ExerciseGroupHeading>{t('exercises.custom.catalog')}</ExerciseGroupHeading>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : undefined
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              // "No exercises found" is only true if we heard back. On a failed fetch
              // it reads as an empty catalogue rather than a connection that dropped.
              listError ? (
                <ErrorState title={t('exercises.picker.loadFailed')} message={listError} onRetry={retryList} />
              ) : myRows.length > 0 || showCreate ? undefined : exerciseCatalogEmpty(debouncedQuery, { items: exercises, hasMore, error: listError }) ? (
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
