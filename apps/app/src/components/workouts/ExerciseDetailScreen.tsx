import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { subDays } from 'date-fns'
import { Archive, ArchiveRestore, ArrowLeft, Camera, Dumbbell, ImagePlus, Merge, MoreVertical, Trash2, Trophy } from '../ui/icons'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import {
  apiErrorMessage,
  customExercisePhotos,
  customExercises,
  uiMessage,
  displayWeight,
  weightShort,
  type Exercise,
  type ExerciseHistoryPoint,
  type PersonalRecord, type UiMessage, formatDate, useTranslation
} from '@lyftr/shared'
import { interactive, TOUCH_MIN, touchTarget } from '../ui/interaction'
import { ActionSheet, AppText, Button, CollapsibleChips, ErrorState, Menu, Screen, scrollBleed, SegmentedControl, Toast, editAction, linkProps, type SheetAction } from '../ui'
import { MuscleDiagram } from './MuscleDiagram'
import { ExerciseHistoryChart, type ChartPoint } from './ExerciseHistoryChart'
import { client, useServerInfo, useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { cameraSupported, uploadPart, type PhotoSource } from '../../lib/exercisePhoto'
import { useExercisePhoto } from '../../hooks/useExercisePhoto'
import { usePhotoPicker } from '../../hooks/usePhotoPicker'
import { useTheme } from '../../theme/useTheme'
import { equipmentLabel, categoryLabel } from '../../utils/exerciseUtils'
import { MuscleBadge } from './MuscleBadge'
import { useSessionPillInset } from './SessionPill'
import { CustomBadge } from './CustomBadge'
import { ExerciseImage } from './ExerciseImage'
import { InstructionSteps } from './InstructionSteps'
import { MergeExerciseSheet } from './MergeExerciseSheet'

// An exercise's page: muscles worked (front/back diagram), image, tags, other muscles, personal
// record, weight history and instructions. On one of your own exercises it also edits, changes
// the photo, archives (undone from the toast) and merges into another.
//
// This is the SHARED screen body: it's mounted by a thin route in every tab stack that
// links to an exercise (workouts/exercise/[id] + programs/exercise/[id]). Duplicating the
// route per stack (rather than one route in the workouts stack) is what keeps back working
// — pushing a workouts-tab route from the programs tab jumps tabs and strands the back
// stack. `backFallback` is where a deep-link with no history returns to (its own tab root).

const BACK_HIT = touchTarget(36, 36)

const HISTORY_PERIODS = ['1m', '3m', '6m', 'All'] as const
type HistoryPeriod = typeof HISTORY_PERIODS[number]
const HISTORY_DAYS: Record<HistoryPeriod, number | null> = { '1m': 30, '3m': 90, '6m': 180, 'All': null }

// Web's loading state: a centered pulsing Dumbbell (animate-pulse). Reanimated opacity
// loop is the RN analog (CSS keyframes have no RN equivalent).
function LoadingPulse() {
  const { brand } = useTheme()
  const o = useSharedValue(1)
  useEffect(() => {
    o.value = withRepeat(withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true)
    return () => cancelAnimation(o)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Screen>
      <View className="items-center justify-center py-20">
        <Animated.View style={style}>
          <Dumbbell size={24} color={brand.cyan} />
        </Animated.View>
      </View>
    </Screen>
  )
}

export function ExerciseDetailScreen({ backFallback }: { backFallback: Href }) {
  const pillInset = useSessionPillInset()
  const { t } = useTranslation()
  const { exerciseId, merged } = useLocalSearchParams<{ exerciseId: string; merged?: string }>()
  const session = useWorkoutSession((s) => s.session)
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  // A bookmarked or redirected link opens here first, before any screen has read the unit.
  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])
  const { colors, brand, accent } = useTheme()
  const wUnit = weightShort(settings.weight_unit)
  const { lg } = useBreakpoint()
  const wide = Platform.OS === 'web' && lg

  // Deep links can land here with no history — fall back to the originating tab's root.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(backFallback))

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [pr, setPR] = useState<PersonalRecord | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryPoint[]>([])
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('3m')
  const [imgFailed, setImgFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  // A UiMessage rather than a sentence, so a failure already on screen follows a language switch.
  const [error, setError] = useState<UiMessage | null>(null)
  // Bumping this re-runs the load effect — three lines, rather than restructuring a
  // working effect to gain a retry button.
  const [retryKey, setRetryKey] = useState(0)
  const [chartWidth, setChartWidth] = useState(0)
  const serverInfo = useServerInfo()
  const canManage = customExercises(serverInfo)
  const photosOn = customExercisePhotos(serverInfo)
  const pickPhoto = usePhotoPicker()
  const [sourceOpen, setSourceOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const heroPhoto = useExercisePhoto(exercise?.id ?? 0, 'full', exercise?.photo_id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [toast, setToast] = useState<{ title: string; variant: 'success' | 'error'; action?: { label: string; onPress: () => void } } | null>(null)
  // Arriving from a merge: say it worked, once (the param is cleared so a re-render or back does not repeat it).
  useEffect(() => {
    if (!merged) return
    setToast({ variant: 'success', title: t('exercises.custom.merge.done', { from: merged }) })
    router.setParams({ merged: undefined })
  }, [merged, t])

  useEffect(() => {
    const id = Number(exerciseId)
    if (!id) { goBack(); return }

    const fromSession = session?.exercises.find((e) => e.exercise_id === id)?.exercise
    // A custom exercise can be renamed or archived from this page while it sits in the session,
    // so the session's copy of one is only the fallback when the server cannot be reached.
    const exercisePromise = fromSession && !fromSession.is_custom
      ? Promise.resolve(fromSession)
      : client.exerciseAPI.get(id).catch((err) => { if (fromSession) return fromSession; throw err })

    let cancelled = false
    Promise.all([
      exercisePromise,
      client.exerciseAPI.getPRs(id).catch(() => null),
      client.exerciseAPI.getHistory(id, 50).catch(() => []),
    ])
      .then(([ex, prData, histData]) => {
        if (cancelled) return
        setExercise(ex)
        setPR(prData)
        setHistory(histData || [])
      })
      .catch((err) => { if (!cancelled) setError({ key: 'errors.unknown', cause: err }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, retryKey])

  // Back from the edit page (or any page that can change this exercise) shows what it now holds.
  // Only a custom exercise can change under us; a catalog one has nothing to revalidate.
  const editable = useRef(false)
  editable.current = !!exercise?.is_custom
  const focusedOnce = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return }
    if (editable.current) setRetryKey((k) => k + 1)
  }, []))

  const filteredHistory = useMemo(() => {
    const days = HISTORY_DAYS[historyPeriod]
    if (days == null) return history
    const cutoff = subDays(new Date(), days).getTime()
    return history.filter((h) => new Date(h.date).getTime() >= cutoff)
  }, [history, historyPeriod])

  // A dropped connection used to goBack() — off the screen, no explanation, nothing to
  // retry. Say what happened and leave them where they tapped.
  if (error) {
    return (
      <Screen>
        <ErrorState
          size="page"
          title={t('exercises.detail.loadFailed')}
          message={uiMessage(error)}
          onRetry={() => { setError(null); setRetryKey((k) => k + 1) }}
          secondary={<Button title={t('common.goBack')} variant="secondary" onPress={goBack} />}
        />
      </Screen>
    )
  }

  if (loading || !exercise) return <LoadingPulse />

  const custom = !!exercise.is_custom
  // A merged exercise is a closed record (the merge can't be undone): it keeps its banner and link
  // to the one that replaced it, and offers nothing to change.
  const showActions = custom && canManage && !exercise.merged_into_id
  const detailPath = (id: number) => `${String(backFallback)}/exercise/${id}`
  // Archiving is one tap and easy to reverse, so it is undone from its toast rather than confirmed.
  const setArchived = async (archive: boolean) => {
    if (archiving) return
    const restoring = !archive
    setArchiving(true)
    try {
      const updated = restoring
        ? await client.exerciseAPI.unarchive(exercise.id)
        : await client.exerciseAPI.archive(exercise.id)
      setExercise(updated)
      setToast({
        variant: 'success',
        title: t(restoring ? 'exercises.custom.actions.unarchived' : 'exercises.custom.actions.archived'),
        action: restoring ? undefined : { label: t('common.undo'), onPress: () => { void setArchived(false) } },
      })
    } catch (err) {
      setToast({
        variant: 'error',
        title: apiErrorMessage(err, t(restoring ? 'exercises.custom.actions.unarchiveFailed' : 'exercises.custom.actions.archiveFailed')),
      })
    } finally {
      setArchiving(false)
    }
  }
  // Photo changes apply at once and the screen updates from the server's answer, the same as archive.
  const changePhoto = async (source: PhotoSource) => {
    if (photoBusy) return
    const out = await pickPhoto(source)
    if (!out) return
    if ('error' in out) { setToast({ variant: 'error', title: out.error }); return }
    setPhotoBusy(true)
    try {
      setExercise(await client.exerciseAPI.uploadPhoto(exercise.id, uploadPart(out.photo)))
      setToast({ variant: 'success', title: t('exercises.custom.photo.updated') })
    } catch (err) {
      setToast({ variant: 'error', title: apiErrorMessage(err, t('exercises.custom.photo.uploadFailed')) })
    } finally {
      setPhotoBusy(false)
    }
  }
  const removePhoto = async () => {
    if (photoBusy) return
    setPhotoBusy(true)
    try {
      setExercise(await client.exerciseAPI.deletePhoto(exercise.id))
      setToast({ variant: 'success', title: t('exercises.custom.photo.removed') })
    } catch (err) {
      setToast({ variant: 'error', title: apiErrorMessage(err, t('exercises.custom.photo.removeFailed')) })
    } finally {
      setPhotoBusy(false)
    }
  }
  const sourceActions: SheetAction[] = [
    { label: t('exercises.custom.photo.choose'), icon: ImagePlus, onPress: () => { void changePhoto('library') } },
    ...(cameraSupported ? [{ label: t('exercises.custom.photo.take'), icon: Camera, onPress: () => { void changePhoto('camera') } }] : []),
  ]
  const editPath = `${detailPath(exercise.id)}/edit`
  const menuActions: SheetAction[] = [
    editAction(() => router.push(editPath as unknown as Href)),
    { label: t('exercises.custom.actions.merge'), icon: Merge, onPress: () => setMerging(true) },
    ...(photosOn ? [
      { label: t(exercise.photo_id ? 'exercises.custom.photo.replace' : 'exercises.custom.photo.add'), icon: ImagePlus, onPress: () => setSourceOpen(true) },
      ...(exercise.photo_id ? [{ label: t('exercises.custom.photo.remove'), icon: Trash2, onPress: () => { void removePhoto() } }] : []),
    ] : []),
    exercise.archived
      ? { label: t('exercises.custom.actions.unarchive'), icon: ArchiveRestore, onPress: () => { void setArchived(false) } }
      : { label: t('exercises.custom.actions.archive'), icon: Archive, onPress: () => { void setArchived(true) } },
  ]
  // The ⋮ trigger: on a photo it sits on a dark scrim with a white glyph so it reads on any picture,
  // elsewhere it is the usual bordered box. 44px either way.
  const kebab = (hero: boolean) => (
    <View className={`h-11 w-11 items-center justify-center rounded-xl ${hero ? 'bg-black/55' : 'border border-surface-border bg-surface-muted'}`}>
      <MoreVertical size={20} color={hero ? '#ffffff' : colors.txMuted} />
    </View>
  )
  // The web gets the anchored dropdown the cards use; a phone gets the sheet, with the exercise it acts on in its header.
  const actionsButton = (hero = false) => {
    if (!showActions) return null
    const busy = archiving || photoBusy
    return Platform.OS === 'web' ? (
      <Menu
        label={t('exercises.custom.actions.menu')}
        items={menuActions.map((a) => ({ label: a.label, icon: a.icon, destructive: a.destructive, onSelect: a.onPress }))}
        disabled={busy}
        className="rounded-xl"
      >
        {kebab(hero)}
      </Menu>
    ) : (
      <Pressable accessibilityRole="button" accessibilityLabel={t('exercises.custom.actions.menu')} disabled={busy} onPress={() => setMenuOpen(true)} className={`active:opacity-70 ${busy ? 'opacity-40' : ''}`}>
        {kebab(hero)}
      </Pressable>
    )
  }
  const overlays = showActions ? (
    <>
      {Platform.OS !== 'web' ? (
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          header={
            <View className="flex-row items-center gap-3">
              <ExerciseImage url={exercise.image_url} photo={{ exerciseId: exercise.id, photoId: exercise.photo_id }} size="hero" />
              <View className="flex-1">
                <AppText variant="subheading" numberOfLines={1}>{exercise.name}</AppText>
                <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">{t('exercises.custom.badgeLabel')}</AppText>
              </View>
            </View>
          }
          actions={menuActions}
        />
      ) : null}
      <ActionSheet open={sourceOpen} title={t('exercises.custom.photo.sourceTitle')} subtitle={exercise.name} actions={sourceActions} onClose={() => setSourceOpen(false)} />
      <MergeExerciseSheet
        source={exercise}
        open={merging}
        onClose={() => setMerging(false)}
        onMerged={(result) => { setMerging(false); router.replace({ pathname: detailPath(result.into.id), params: { merged: exercise.name } } as unknown as Href) }}
      />
      {toast ? <Toast variant={toast.variant} title={toast.title} action={toast.action} onDismiss={() => setToast(null)} /> : null}
    </>
  ) : null

  const equipLabel = equipmentLabel(exercise.equipment)
  const periodOptions = HISTORY_PERIODS.map((p) => ({ value: p, label: t(`exercises.detail.period.${p}`) }))
  const chartData: ChartPoint[] = [...filteredHistory].reverse().map((h) => ({
    date: formatDate(new Date(h.date), 'numericMonthDay'),
    weight: displayWeight(h.max_weight, wUnit),
  }))

  // A custom exercise's own picture replaces the catalog image; while it loads the hero's space is
  // held so the page does not jump, and a failed load drops back to the no-image layout.
  const hasOwnPhoto = !!exercise.photo_id
  const hasImage = hasOwnPhoto ? !heroPhoto.failed : !!exercise.image_url && !imgFailed
  const heroSource = hasOwnPhoto ? (heroPhoto.uri ? { uri: heroPhoto.uri } : undefined) : { uri: exercise.image_url }

  const backButton = (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      // The old -ml-2 (8px) keeps the glyph on the screen's left edge once the 4px of padding is in.
      style={{ ...BACK_HIT.style, marginLeft: -12 }}
      className={BACK_HIT.outer}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-lg group-active/hit:bg-surface-muted group-hover/hit:bg-surface-muted ${BACK_HIT.inner}`}>
        <ArrowLeft size={20} color={colors.txMuted} />
      </View>
    </Pressable>
  )
  // Title + identity badges (muscle group + equipment + category, grouped).
  const titleBlock = (
    <View>
      <AppText variant="title">{exercise.name}</AppText>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        {custom ? <CustomBadge pill /> : null}
        <MuscleBadge muscle={exercise.muscle_group} pill />
        {equipLabel && exercise.equipment !== 'other' ? (
          <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1">
            <AppText variant="caption" color="secondary">{equipLabel}</AppText>
          </View>
        ) : null}
        {exercise.category ? (
          <View className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1">
            <AppText variant="caption" className="capitalize" style={{ color: accent }}>{categoryLabel(exercise.category)}</AppText>
          </View>
        ) : null}
      </View>
      {custom && exercise.archived ? (
        <View className="mt-3 rounded-xl border border-surface-border bg-surface-muted px-3 py-2.5">
          <AppText variant="caption" color="secondary">
            {exercise.merged_into_id ? t('exercises.custom.mergedNote') : t('exercises.custom.archivedNote')}
          </AppText>
          {!exercise.merged_into_id ? (
            <Pressable
              onPress={() => { void setArchived(false) }}
              disabled={archiving}
              accessibilityRole="button"
              style={{ minHeight: TOUCH_MIN }}
              className={`self-start justify-center rounded-lg ${interactive('hover:opacity-80')}`}
            >
              <AppText variant="bodySemibold" style={{ color: accent }}>{t('exercises.custom.actions.unarchive')}</AppText>
            </Pressable>
          ) : null}
          {exercise.merged_into_id ? (
            <Pressable
              {...linkProps(detailPath(exercise.merged_into_id), () => router.replace(detailPath(exercise.merged_into_id!) as unknown as Href))}
              className="min-h-[44px] justify-center"
            >
              <AppText variant="bodySemibold" style={{ color: accent }}>{t('exercises.custom.viewMerged')}</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
  const musclesCard = (
    <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <AppText variant="label" color="muted" className="mb-3 uppercase">{t('exercises.detail.musclesWorked')}</AppText>
      <MuscleDiagram exercise={exercise} />
    </View>
  )
  const secondaryBlock = exercise.secondary_muscles?.length > 0 ? (
    <View>
      <AppText variant="label" color="muted" className="mb-2 uppercase">{t('exercises.detail.alsoWorks')}</AppText>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <CollapsibleChips compact items={exercise.secondary_muscles} renderChip={(m) => <MuscleBadge key={m} muscle={m} wide />} />
      </View>
    </View>
  ) : null
  // Personal record — gold "achievement" treatment: tinted card + trophy chip, a hero weight,
  // and a divided Est. 1RM footer.
  const prCard = pr && pr.weight > 0 ? (
    <View className="rounded-2xl border border-warning-500/25 bg-warning-500/[0.06] p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-warning-500/15">
            <Trophy size={15} color={brand.warningSoft} />
          </View>
          <AppText variant="label" color="muted" className="uppercase">{t('exercises.detail.personalBest')}</AppText>
        </View>
        <AppText variant="caption" color="muted">{formatDate(new Date(pr.date), 'monthDayYear')}</AppText>
      </View>

      <View className="mt-3 flex-row items-end gap-2">
        <Text className="font-display text-3xl text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>
          {displayWeight(pr.weight, wUnit)}
        </Text>
        <AppText variant="body" color="muted" className="mb-1">{t('exercises.detail.bestSet', { unit: wUnit, count: pr.reps })}</AppText>
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-warning-500/15 pt-3">
        <AppText variant="caption" color="muted">{t('exercises.detail.estimated1rm')}</AppText>
        <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>
          {displayWeight(pr.estimated_1rm, wUnit)} {wUnit}
        </AppText>
      </View>
    </View>
  ) : null
  const historyCard = history.length >= 2 ? (
    <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      {/* Label + period selector STACKED: the 4-option control + label don't fit
          on one row at real device widths (overflowed/clipped the card). */}
      <AppText variant="label" color="muted" className="mb-3 uppercase">{t('exercises.detail.weightProgression')}</AppText>
      <SegmentedControl size="sm" className="mb-3" options={periodOptions} value={historyPeriod} onChange={setHistoryPeriod} />
      <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
        {chartData.length < 2 ? (
          <View className="h-[110px] items-center justify-center">
            <AppText variant="body" color="muted">{t('exercises.detail.noPeriodData')}</AppText>
          </View>
        ) : (
          <ExerciseHistoryChart data={chartData} width={chartWidth} unit={wUnit} />
        )}
      </View>
    </View>
  ) : null
  const instructionsCard = (
    <InstructionSteps
      text={exercise.description}
      addHref={showActions ? editPath : undefined}
      onAdd={showActions ? () => router.push(editPath as unknown as Href) : undefined}
    />
  )

  // Wide web: the reference (photo, muscles) on the left and the lifter's own numbers and the
  // how-to on the right, under one title row, instead of a phone column stretched to the window.
  if (wide) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 + pillInset }}>
          <View className="mx-auto w-full max-w-6xl gap-6 px-5 py-6">
            <View className="flex-row items-start gap-3">
              <View className="pt-1">{backButton}</View>
              <View className="flex-1">{titleBlock}</View>
              {actionsButton()}
            </View>
            <View className="flex-row items-start gap-6">
              <View className="gap-5" style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}>
                {hasImage ? (
                  <Image
                    source={heroSource}
                    onError={() => setImgFailed(true)}
                    resizeMode="cover"
                    className="h-72 w-full rounded-2xl bg-surface-muted"
                  />
                ) : null}
                {musclesCard}
                {secondaryBlock}
              </View>
              <View className="gap-5" style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}>
                {prCard}
                {historyCard}
                {instructionsCard}
              </View>
            </View>
          </View>
        </ScrollView>
        {overlays}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <ScrollView style={scrollBleed} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 + pillInset }}>
        {/* Hero image — full-bleed, with an overlaid back button (mirrors the gym
            exercise-info treatment). Falls back to a plain back row when there's no photo. */}
        {hasImage ? (
          <View>
            <Image
              source={heroSource}
              onError={() => setImgFailed(true)}
              resizeMode="cover"
              className="h-64 w-full bg-surface-muted"
            />
            {/* Top scrim so the white back chevron reads on any photo. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96 }}
              pointerEvents="none"
            />
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              // The negative margin already offsets the 4px of padding, so left/top stay as they were.
              style={BACK_HIT.style}
              className={`absolute left-4 top-3 ${BACK_HIT.outer}`}
            >
              <View className={`h-9 w-9 items-center justify-center rounded-full bg-black/40 group-active/hit:bg-black/60 ${BACK_HIT.inner}`}>
                <ArrowLeft size={20} color="#ffffff" />
              </View>
            </Pressable>
            {showActions ? <View className="absolute right-3 top-2">{actionsButton(true)}</View> : null}
          </View>
        ) : null}

        <View className="gap-5 px-5 py-4">
          {/* Back row only when there's no hero image to host the button. */}
          {!hasImage ? (
            <View className="flex-row items-center justify-between">
              {backButton}
              {showActions ? <View style={{ marginRight: -8 }}>{actionsButton()}</View> : null}
            </View>
          ) : null}

          {titleBlock}

          {instructionsCard}

          {musclesCard}

          {secondaryBlock}

          {prCard}

          {historyCard}
        </View>
      </ScrollView>
      {overlays}
    </SafeAreaView>
  )
}
