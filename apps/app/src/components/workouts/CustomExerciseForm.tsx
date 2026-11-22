import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, View, type ScrollViewInstance, type TextInputInstance } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  CUSTOM_EXERCISE_CATEGORIES, CUSTOM_EXERCISE_EQUIPMENT, CUSTOM_EXERCISE_MUSCLES, customExercisePhotos, EXERCISE_SEARCH_DEBOUNCE_MS, uiMessage, useAsyncAction, useTranslation,
  type Exercise, type UiMessage,
} from '@lyftr/shared'
import { Dumbbell, FileText, Layers, Lock, Pencil, Target } from '../ui/icons'
import {
  AppText, Button, Card, ErrorState, FieldHeader, FormField, FormPage, IconTileGroup, PhotoSlot, RequiredLegend, SR_ONLY, useDiscardGuard, type PhotoSlotLabels,
} from '../ui'
import { interactive, TOUCH_MIN } from '../ui/interaction'
import { client, useServerInfo } from '../../lib/lyftr'
import { uploadPart, type ExercisePhoto, type PhotoSource } from '../../lib/exercisePhoto'
import { cancelExerciseCreate, hasExerciseCreate, resolveExerciseCreate } from '../../lib/exerciseCreateRequests'
import { useExercisePhoto } from '../../hooks/useExercisePhoto'
import { usePhotoPicker } from '../../hooks/usePhotoPicker'
import { useTheme } from '../../theme/useTheme'
import { muscleChipLabel, muscleLabel, titleCase } from '../../utils/exerciseUtils'
import {
  CATEGORY_OPTIONS, DEFAULT_CATEGORY, DEFAULT_EQUIPMENT, EQUIPMENT_OPTIONS, MUSCLE_GROUPS,
} from './exerciseOptions'
import { BodyMapPicker } from './BodyMapPicker'
import { MAX_SECONDARY_MUSCLES, validateCustomExercise, type CustomExerciseErrors } from './validateCustomExercise'

type Base = '/workouts' | '/programs'
const SCROLL_MARGIN = 12

interface BodyProps {
  mode: 'create' | 'edit'
  base: Base
  exercise?: Exercise
  initialName?: string
  request?: string
}

function FormBody({ mode, base, exercise, initialName, request }: BodyProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const scrollRef = useRef<ScrollViewInstance>(null)
  const pos = useRef({ name: 0, muscle: 0 })
  const nameRef = useRef<TextInputInstance>(null)
  const [announcement, setAnnouncement] = useState('')

  const e = mode === 'edit' ? exercise : undefined
  // A row saved before the options were narrowed to what the catalog uses may hold a slug the
  // server now refuses. The form starts from what it can offer: such a main muscle is asked for
  // again, and other values fall back to the defaults or drop out.
  const offered = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : undefined)
  const initial = {
    name: e ? e.name : (initialName ?? '').trim(),
    muscle: offered(CUSTOM_EXERCISE_MUSCLES, e?.muscle_group) ?? null,
    equipment: offered(CUSTOM_EXERCISE_EQUIPMENT, e?.equipment) ?? DEFAULT_EQUIPMENT,
    category: offered(CUSTOM_EXERCISE_CATEGORIES, e?.category) ?? DEFAULT_CATEGORY,
    secondary: (e?.secondary_muscles ?? []).filter((m) => CUSTOM_EXERCISE_MUSCLES.includes(m)),
    notes: e?.description ?? '',
  }
  const [name, setName] = useState(initial.name)
  const [muscle, setMuscle] = useState<string | null>(initial.muscle)
  const [equipment, setEquipment] = useState(initial.equipment)
  const [category, setCategory] = useState(initial.category)
  const [secondary, setSecondary] = useState<string[]>(initial.secondary)
  const [notes, setNotes] = useState(initial.notes)
  const [errors, setErrors] = useState<CustomExerciseErrors>({})
  const [nearMatches, setNearMatches] = useState<Exercise[]>([])
  const photosOn = customExercisePhotos(useServerInfo())
  const pickPhoto = usePhotoPicker()
  const [staged, setStaged] = useState<ExercisePhoto | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const [pickError, setPickError] = useState('')
  // The exercise as the server now holds it, once it was saved but its photo step failed.
  const [saved, setSaved] = useState<Exercise | null>(null)

  const dirty = !saved && (
    name !== initial.name || muscle !== initial.muscle || equipment !== initial.equipment || category !== initial.category
    || notes !== initial.notes || secondary.join() !== initial.secondary.join() || !!staged || photoRemoved
  )
  const guard = useDiscardGuard(dirty)

  // A page left without saving (Back, a swipe, a link) lets its request go. Deferred a tick so a
  // development remount, which runs cleanup and setup back to back, does not cancel a live page.
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      if (request) setTimeout(() => { if (!live.current) cancelExerciseCreate(request) }, 0)
    }
  }, [request])

  const detailPath = (id: number) => `${base}/exercise/${id}` as unknown as Href

  // Near matches: catalog rows for the name being typed. Advice only, so a failure just hides it.
  const trimmed = name.trim()
  useEffect(() => {
    if (mode !== 'create' || trimmed.length < 2) {
      setNearMatches([])
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      client.exerciseAPI
        .list({ q: trimmed, limit: 3 })
        .then((data) => { if (!stale) setNearMatches((data ?? []).filter((x) => !x.is_custom).slice(0, 3)) })
        .catch(() => { if (!stale) setNearMatches([]) })
    }, EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => { stale = true; clearTimeout(timer) }
  }, [mode, trimmed])

  const hasPhotoChange = photosOn && (!!staged || (photoRemoved && !!exercise?.photo_id))

  // Where the page goes once the exercise exists. With a request the caller (a workout or a
  // program day under this page) gets it as if picked; with none, or none left to answer
  // (the page was reloaded), the exercise's own page opens in its place.
  const finish = (ex: Exercise) => {
    guard.allowLeave()
    if (mode === 'edit') {
      if (router.canGoBack()) router.back()
      else router.replace(detailPath(ex.id))
      return
    }
    if (request && resolveExerciseCreate(request, ex)) {
      router.back()
      return
    }
    router.replace(detailPath(ex.id))
  }

  // The photo goes after the exercise exists. If it fails the exercise is already saved, so the
  // page stays on the error (Try again / Skip) instead of dropping what the user just made.
  const sendPhoto = useAsyncAction(async (ex: Exercise) => {
    const done = staged
      ? await client.exerciseAPI.uploadPhoto(ex.id, uploadPart(staged))
      : await client.exerciseAPI.deletePhoto(ex.id)
    finish(done)
  }, t('exercises.custom.photo.uploadFailed'))

  const save = useAsyncAction(async () => {
    const input = {
      name: trimmed,
      muscle_group: muscle ?? '',
      equipment,
      category,
      secondary_muscles: secondary.filter((m) => m !== muscle),
      description: notes.trim(),
    }
    const ex = mode === 'edit' && exercise
      ? await client.exerciseAPI.update(exercise.id, input)
      : await client.exerciseAPI.create(input)
    if (!hasPhotoChange) { finish(ex); return }
    setSaved(ex)
    await sendPhoto.run(ex)
  }, t('exercises.custom.form.saveFailed'))

  const choosePhoto = async (source: PhotoSource) => {
    setPickError('')
    const out = await pickPhoto(source)
    if (!out) return
    if ('error' in out) { setPickError(out.error); return }
    setStaged(out.photo)
    setPhotoRemoved(false)
  }
  const removePhoto = () => { setStaged(null); setPhotoRemoved(true); setPickError('') }
  const existingPhotoId = photoRemoved ? undefined : exercise?.photo_id
  const own = useExercisePhoto(exercise?.id ?? 0, 'full', staged ? undefined : existingPhotoId)
  const photoLabels: PhotoSlotLabels = {
    add: t('exercises.custom.photo.add'), addHint: t('exercises.custom.photo.addHint'),
    replace: t('exercises.custom.photo.replace'), remove: t('exercises.custom.photo.remove'),
    choose: t('exercises.custom.photo.choose'), take: t('exercises.custom.photo.take'),
    sourceTitle: t('exercises.custom.photo.sourceTitle'), preview: t('exercises.custom.photo.preview'),
    pending: t('exercises.custom.photo.pending'),
  }

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace(base as unknown as Href)
  }
  const scrollTo = (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_MARGIN), animated: true })

  const announce = (msg: string) => {
    if (Platform.OS === 'web') setAnnouncement(msg)
    else AccessibilityInfo.announceForAccessibility(msg)
  }

  // Tapping Create with something missing says what and where: scroll to the first field, put the
  // cursor in it when it is a text field, and have a screen reader read the message.
  const submit = () => {
    if (save.busy || saved) return
    const found = validateCustomExercise({ name, muscle })
    setErrors(found)
    if (found.name) {
      scrollTo(pos.current.name)
      nameRef.current?.focus()
      announce(t(found.name === 'controlChars' ? 'exercises.custom.form.nameControlChars' : 'exercises.custom.form.nameRequired'))
    } else if (found.muscle) {
      scrollTo(pos.current.muscle)
      announce(t('exercises.custom.form.muscleRequired'))
    } else void save.run()
  }

  // The page scrolls to the first invalid field, so when the main muscle is also missing it is
  // below the fold: the sticky bar says so, beside the button that was pressed.
  const pointer = errors.name && errors.muscle ? t('exercises.custom.form.muscleRequired') : null
  const pickMuscle = (m: string) => { setMuscle(m); setErrors((p) => ({ ...p, muscle: undefined })); setSecondary((p) => p.filter((x) => x !== m)) }
  const label = t(mode === 'edit' ? 'exercises.custom.form.save' : request && hasExerciseCreate(request) ? 'exercises.custom.form.createAndAdd' : 'exercises.custom.form.create')
  const busy = save.busy || sendPhoto.busy
  const groups = MUSCLE_GROUPS.map((g) => ({ key: g.key, label: t(g.labelKey), muscles: g.muscles.map((m) => ({ value: m, label: muscleChipLabel(m) })) }))

  return (
    <FormPage
      title={t(mode === 'edit' ? 'exercises.custom.form.editTitle' : 'exercises.custom.form.createTitle')}
      subtitle={(
        <View className="flex-row items-center gap-1">
          <Lock size={11} color={colors.txMuted} />
          <AppText variant="caption" color="muted">{t('exercises.custom.form.privateNote')}</AppText>
        </View>
      )}
      onBack={goBack}
      guard={guard}
      scrollRef={scrollRef}
      primary={{ label, onPress: submit, busy: save.busy }}
      secondary={{ label: t('common.cancel'), onPress: goBack }}
      error={saved ? (sendPhoto.error ? `${t('exercises.custom.photo.savedNoPhoto')} ${sendPhoto.error}` : null) : save.error || pointer}
      footer={saved ? (
        <View className="flex-row gap-3">
          <Button className="flex-1" title={t('exercises.custom.photo.tryAgain')} loading={sendPhoto.busy} onPress={() => { void sendPhoto.run(saved) }} />
          <Button className="flex-1" variant="secondary" title={t('exercises.custom.photo.skip')} disabled={sendPhoto.busy} onPress={() => finish(saved)} />
        </View>
      ) : undefined}
    >
      <RequiredLegend />

      {photosOn ? (
        <PhotoSlot
          filled={!!staged || !!existingPhotoId}
          uri={staged?.uri ?? own.uri}
          pending={!!staged}
          busy={busy}
          error={pickError}
          labels={photoLabels}
          onPick={(source: PhotoSource) => { void choosePhoto(source) }}
          onRemove={removePhoto}
        />
      ) : null}

      <View onLayout={(ev) => { pos.current.name = ev.nativeEvent.layout.y }}>
        <FieldHeader icon={Pencil} label={t('exercises.custom.form.name')} requiredInput />
        <FormField
          ref={nameRef}
          accessibilityLabel={t('exercises.custom.form.name')}
          required
          value={name}
          onChangeText={(v) => { setName(v); if (v.trim()) setErrors((p) => ({ ...p, name: undefined })) }}
          placeholder={t('exercises.custom.form.namePlaceholder')}
          error={errors.name ? t(errors.name === 'controlChars' ? 'exercises.custom.form.nameControlChars' : 'exercises.custom.form.nameRequired') : null}
          autoCapitalize="words"
          maxLength={100}
          returnKeyType="done"
          // Enter saves on the web; on a phone Done just puts the keyboard away.
          onSubmitEditing={() => { if (Platform.OS === 'web') submit() }}
          footer={nearMatches.length > 0 ? (
            <View className="mt-2 gap-1 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3">
              <AppText variant="subheading">{t('exercises.custom.form.nearMatches')}</AppText>
              <AppText variant="caption" color="muted">{t('exercises.custom.form.nearMatchesHint')}</AppText>
              {nearMatches.map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('exercises.custom.form.useMatch', { name: m.name })}
                  onPress={() => finish(m)}
                  style={{ minHeight: TOUCH_MIN }}
                  className={`flex-row items-center justify-between gap-2 active:opacity-60 ${interactive('hover:bg-surface-muted')}`}
                >
                  <View className="flex-1">
                    <AppText variant="bodySemibold" numberOfLines={2}>{m.name}</AppText>
                    <AppText variant="caption" color="muted" numberOfLines={1}>{titleCase(muscleLabel(m.muscle_group))}</AppText>
                  </View>
                  <AppText variant="bodySemibold" color="brand">{t('exercises.custom.form.useThis')}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        />
      </View>

      <View>
        <FieldHeader icon={FileText} label={t('exercises.custom.form.instructions')} hint={t('exercises.custom.form.instructionsHint')} />
        <FormField
          accessibilityLabel={t('exercises.custom.form.instructions')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('exercises.custom.form.instructionsPlaceholder')}
          multiline
          maxLength={2000}
        />
      </View>

      <View onLayout={(ev) => { pos.current.muscle = ev.nativeEvent.layout.y }}>
        <FieldHeader icon={Target} label={t('exercises.custom.form.muscle')} required />
        <Card className="gap-3">
          <AppText variant="caption" color="muted">{t('exercises.custom.form.muscleHint')}</AppText>
          <BodyMapPicker value={muscle} secondary={secondary} onChange={pickMuscle} groups={groups} invalid={!!errors.muscle} />
          {errors.muscle ? <AppText variant="caption" color="error" role={Platform.OS === 'web' ? 'alert' : undefined}>{t('exercises.custom.form.muscleRequired')}</AppText> : null}
        </Card>
      </View>

      <View>
        <FieldHeader icon={Target} label={t('exercises.custom.form.otherMuscles')} />
        <Card className="gap-3">
          <AppText variant="caption" color={muscle || secondary.length > 0 ? 'muted' : 'secondary'}>
            {muscle || secondary.length > 0 ? t('exercises.custom.form.otherMusclesHint', { max: MAX_SECONDARY_MUSCLES }) : t('exercises.custom.form.otherMusclesLocked')}
          </AppText>
          <BodyMapPicker mode="multi" value={secondary} main={muscle} max={MAX_SECONDARY_MUSCLES} onChange={setSecondary} groups={groups} />
        </Card>
      </View>

      <View>
        <FieldHeader icon={Dumbbell} label={t('exercises.custom.form.equipment')} />
        <IconTileGroup
          layout="tile"
          label={t('exercises.custom.form.equipment')}
          options={EQUIPMENT_OPTIONS.map((o) => ({ value: o.value, icon: o.icon, label: t(o.labelKey) }))}
          value={equipment}
          onChange={setEquipment}
        />
      </View>

      <View>
        <FieldHeader icon={Layers} label={t('exercises.custom.form.category')} />
        <IconTileGroup
          label={t('exercises.custom.form.category')}
          options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, icon: o.icon, label: titleCase(t(o.labelKey)) }))}
          value={category}
          onChange={setCategory}
        />
      </View>
      {announcement ? <View accessibilityLiveRegion="polite" style={SR_ONLY}><AppText>{announcement}</AppText></View> : null}
    </FormPage>
  )
}

// `exercise/new` and `exercise/[exerciseId]/edit` render this, mirrored per tab so Back stays in
// the tab. A create is ready at once; an edit loads its exercise first.
export function CustomExerciseForm({ mode, base }: { mode: 'create' | 'edit'; base: Base }) {
  const { t } = useTranslation()
  const { exerciseId, name, request } = useLocalSearchParams<{ exerciseId?: string; name?: string; request?: string }>()
  const { accent } = useTheme()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [error, setError] = useState<UiMessage | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(base as unknown as Href))

  useEffect(() => {
    if (mode !== 'edit') return
    const id = Number(exerciseId)
    if (!id) { setError({ key: 'exercises.custom.form.notEditable' }); return }
    let cancelled = false
    client.exerciseAPI.get(id)
      .then((ex) => { if (!cancelled) setExercise(ex) })
      .catch((err) => { if (!cancelled) setError({ key: 'errors.unknown', cause: err }) })
    return () => { cancelled = true }
  }, [mode, exerciseId, retryKey])

  if (mode === 'create') return <FormBody mode="create" base={base} initialName={name} request={request} />

  if (error || (exercise && !exercise.is_custom)) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
        <ErrorState
          size="page"
          title={t('exercises.custom.form.loadFailed')}
          message={error ? uiMessage(error) : t('exercises.custom.form.notEditable')}
          onRetry={error ? () => { setError(null); setRetryKey((k) => k + 1) } : undefined}
          secondary={<Button title={t('common.goBack')} variant="secondary" onPress={goBack} />}
        />
      </SafeAreaView>
    )
  }
  if (!exercise) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-base" edges={['top']}>
        <ActivityIndicator color={accent} accessibilityLabel={Platform.OS === 'web' ? t('common.loading') : undefined} />
      </SafeAreaView>
    )
  }
  return <FormBody key={exercise.id} mode="edit" base={base} exercise={exercise} />
}
