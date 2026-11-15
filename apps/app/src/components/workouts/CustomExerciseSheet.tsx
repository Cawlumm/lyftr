import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import {
  customExercisePhotos, CUSTOM_EXERCISE_CATEGORIES, CUSTOM_EXERCISE_EQUIPMENT, CUSTOM_EXERCISE_MUSCLES, EXERCISE_SEARCH_DEBOUNCE_MS,
  useAsyncAction, useTranslation, type CustomExerciseInput, type Exercise,
} from '@lyftr/shared'
import { ChevronDown, ChevronUp } from '../ui/icons'
import { Alert, AppText, Button, Field, Sheet } from '../ui'
import { interactive, TOUCH_MIN, webToggle } from '../ui/interaction'
import { client, useServerInfo } from '../../lib/lyftr'
import { cameraSupported, uploadPart, type ExercisePhoto } from '../../lib/exercisePhoto'
import { useExercisePhoto } from '../../hooks/useExercisePhoto'
import { usePhotoPicker } from '../../hooks/usePhotoPicker'
import { useTheme } from '../../theme/useTheme'
import { categoryLabel, equipmentLabel, muscleLabel } from '../../utils/exerciseUtils'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  initialName?: string
  exercise?: Exercise
  submitLabel?: 'createAndAdd' | 'create'
  onSaved: (exercise: Exercise) => void
  onUseExisting?: (exercise: Exercise) => void
  onClose: () => void
}

const DEFAULT_EQUIPMENT = 'body-only'
const DEFAULT_CATEGORY = 'strength'
const PICK_LIBRARY = 'library'
const PICK_CAMERA = 'camera'

function Chip({ label, selected, role, onPress }: { label: string; selected: boolean; role: 'radio' | 'checkbox'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      {...webToggle(selected, onPress)}
      onPress={onPress}
      style={{ minHeight: TOUCH_MIN }}
      className={`items-center justify-center rounded-full border px-3.5 active:opacity-70 ${
        selected ? 'border-brand-500 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
      } ${interactive('hover:bg-surface-border')}`}
    >
      <AppText variant="bodySemibold" color={selected ? 'primary' : 'secondary'} className="text-[13px] capitalize">{label}</AppText>
    </Pressable>
  )
}

function ChipGroup({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <View className="gap-1.5">
      <AppText variant="label" color="muted">{label}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">{children}</View>
      {error ? <AppText variant="caption" color="error">{error}</AppText> : null}
    </View>
  )
}

// The photo field. The picture is staged here and only sent when the form is saved, so Cancel
// discards it and a half-typed form never leaves a stray upload on the server.
function PhotoField({ exercise, staged, removed, busy, error, onChoose, onTake, onRemove }: {
  exercise?: Exercise
  staged: ExercisePhoto | null
  removed: boolean
  busy: boolean
  error: string
  onChoose: () => void
  onTake: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const existingId = removed ? undefined : exercise?.photo_id
  const own = useExercisePhoto(exercise?.id ?? 0, 'thumb', staged ? undefined : existingId)
  const uri = staged?.uri ?? own.uri
  const has = !!staged || !!existingId
  return (
    <View className="gap-1.5">
      <AppText variant="label" color="muted">{t('exercises.custom.photo.label')}</AppText>
      {has ? (
        <View className="items-start gap-2">
          {uri ? (
            <Image
              source={{ uri }}
              accessibilityLabel={t('exercises.custom.photo.preview')}
              resizeMode="cover"
              className="h-32 w-48 rounded-xl bg-surface-muted"
            />
          ) : (
            <View className="h-32 w-48 rounded-xl bg-surface-muted" />
          )}
          {staged ? <AppText variant="caption" color="muted">{t('exercises.custom.photo.pending')}</AppText> : null}
        </View>
      ) : (
        <AppText variant="caption" color="muted">{t('exercises.custom.photo.hint')}</AppText>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          title={t(has ? 'exercises.custom.photo.replace' : 'exercises.custom.photo.choose')}
          onPress={onChoose}
        />
        {cameraSupported ? (
          <Button variant="secondary" disabled={busy} title={t('exercises.custom.photo.take')} onPress={onTake} />
        ) : null}
        {has ? (
          <Button variant="ghost" disabled={busy} title={t('exercises.custom.photo.remove')} onPress={onRemove} />
        ) : null}
      </View>
      {error ? <AppText variant="caption" color="error">{error}</AppText> : null}
    </View>
  )
}

// Create / edit form for a user's own exercise. Rendered as a Sheet, so from inside the picker's
// Modal it is a nested Modal (rendered as a child of the picker's tree, which RN supports).
export function CustomExerciseSheet({ open, mode, initialName, exercise, submitLabel, onSaved, onUseExisting, onClose }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const titleId = useId()
  const { height } = useWindowDimensions()

  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [equipment, setEquipment] = useState(DEFAULT_EQUIPMENT)
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [secondary, setSecondary] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [muscleError, setMuscleError] = useState(false)
  const [nearMatches, setNearMatches] = useState<Exercise[]>([])
  const [keyboard, setKeyboard] = useState(0)
  const photosOn = customExercisePhotos(useServerInfo())
  const pickPhoto = usePhotoPicker()
  const [staged, setStaged] = useState<ExercisePhoto | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const [pickError, setPickError] = useState('')
  // The exercise as the server now holds it, once it was saved but its photo step failed.
  const [saved, setSaved] = useState<Exercise | null>(null)

  // Reset on every open, from the props as they are then: a parent handing a fresh `exercise`
  // object each render must not wipe what is being typed.
  const seed = useRef({ mode, exercise, initialName })
  seed.current = { mode, exercise, initialName }
  useEffect(() => {
    if (!open) return
    const { mode: m, exercise: ex, initialName: initial } = seed.current
    const e = m === 'edit' ? ex : undefined
    setName(e ? e.name : (initial ?? '').trim())
    setMuscle(e?.muscle_group ?? null)
    setEquipment(e?.equipment || DEFAULT_EQUIPMENT)
    setCategory(e?.category || DEFAULT_CATEGORY)
    setSecondary(e?.secondary_muscles ?? [])
    setNotes(e?.description ?? '')
    setShowMore(!!e && (!!e.description || (e.secondary_muscles ?? []).length > 0 || (!!e.category && e.category !== DEFAULT_CATEGORY)))
    setNameError(false)
    setMuscleError(false)
    setNearMatches([])
    setStaged(null)
    setPhotoRemoved(false)
    setPickError('')
    setSaved(null)
  }, [open])

  useEffect(() => {
    if (Platform.OS === 'web') return
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  // Near matches: catalog rows for the name being typed. Advice only, so a failure just hides it.
  const trimmed = name.trim()
  const canUseExisting = !!onUseExisting
  useEffect(() => {
    if (!open || mode !== 'create' || !canUseExisting || trimmed.length < 2) {
      setNearMatches([])
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      client.exerciseAPI
        .list({ q: trimmed, limit: 3 })
        .then((data) => { if (!stale) setNearMatches((data ?? []).filter((e) => !e.is_custom).slice(0, 3)) })
        .catch(() => { if (!stale) setNearMatches([]) })
    }, EXERCISE_SEARCH_DEBOUNCE_MS)
    return () => { stale = true; clearTimeout(timer) }
  }, [open, mode, canUseExisting, trimmed])

  const hasPhotoChange = photosOn && (!!staged || (photoRemoved && !!exercise?.photo_id))

  // The photo goes after the exercise exists. If it fails the exercise is already saved, so the sheet
  // stays open on the error (Try again / Skip) instead of dropping the exercise the user just made.
  const sendPhoto = useAsyncAction(async (ex: Exercise) => {
    const done = staged
      ? await client.exerciseAPI.uploadPhoto(ex.id, uploadPart(staged))
      : await client.exerciseAPI.deletePhoto(ex.id)
    onSaved(done)
  }, t('exercises.custom.photo.uploadFailed'))

  const save = useAsyncAction(async (input: CustomExerciseInput) => {
    const ex = mode === 'edit' && exercise
      ? await client.exerciseAPI.update(exercise.id, input)
      : await client.exerciseAPI.create(input)
    if (!hasPhotoChange) { onSaved(ex); return }
    setSaved(ex)
    await sendPhoto.run(ex)
  }, t('exercises.custom.sheet.saveFailed'))

  const choosePhoto = async (source: 'library' | 'camera') => {
    setPickError('')
    const out = await pickPhoto(source)
    if (!out) return
    if ('error' in out) { setPickError(out.error); return }
    setStaged(out.photo)
    setPhotoRemoved(false)
  }
  const removePhoto = () => { setStaged(null); setPhotoRemoved(true); setPickError('') }
  // Closing from the error state must still tell the caller the exercise exists.
  const close = () => { if (saved) onSaved(saved); else onClose() }

  const submit = () => {
    if (save.busy) return
    setNameError(!trimmed)
    setMuscleError(!muscle)
    if (!trimmed || !muscle) return
    void save.run({
      name: trimmed,
      muscle_group: muscle,
      equipment,
      category,
      secondary_muscles: secondary.filter((m) => m !== muscle),
      description: notes.trim(),
    })
  }

  const toggleSecondary = (m: string) =>
    setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const label = mode === 'edit'
    ? t('exercises.custom.sheet.save')
    : t(submitLabel === 'createAndAdd' ? 'exercises.custom.sheet.createAndAdd' : 'exercises.custom.sheet.create')
  const MoreIcon = showMore ? ChevronUp : ChevronDown
  // The form is taller than a phone. Title and button stay put and only the fields scroll, so
  // the action is always in reach; the scroll area gets what the window has left (a bottom
  // sheet, native or narrow web, has no cap of its own).
  const scrollMax = Math.max(160, height - keyboard - 260)

  return (
    <Sheet open={open} onClose={close} labelledBy={titleId} width="lg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="gap-1 px-5 pb-3">
          <AppText nativeID={titleId} variant="heading">
            {t(mode === 'edit' ? 'exercises.custom.sheet.editTitle' : 'exercises.custom.sheet.createTitle')}
          </AppText>
          {mode === 'create' ? <AppText variant="caption" color="muted">{t('exercises.custom.sheet.privateNote')}</AppText> : null}
        </View>
        <ScrollView
          style={{ maxHeight: scrollMax }}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-5 pb-2"
        >
          <Field
            label={t('exercises.custom.sheet.name')}
            value={name}
            onChangeText={(v) => { setName(v); if (v.trim()) setNameError(false) }}
            placeholder={t('exercises.custom.sheet.namePlaceholder')}
            error={nameError ? t('exercises.custom.sheet.nameRequired') : null}
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          {nearMatches.length > 0 ? (
            <View className="gap-1.5 rounded-xl border border-surface-border bg-surface-muted/50 p-3">
              <AppText variant="subheading">{t('exercises.custom.sheet.nearMatches')}</AppText>
              <AppText variant="caption" color="muted">{t('exercises.custom.sheet.nearMatchesHint')}</AppText>
              {nearMatches.map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('exercises.custom.sheet.useMatch', { name: m.name })}
                  onPress={() => onUseExisting?.(m)}
                  style={{ minHeight: TOUCH_MIN }}
                  className={`flex-row items-center justify-between gap-2 active:opacity-60 ${interactive('hover:bg-surface-muted')}`}
                >
                  <AppText variant="bodySemibold" numberOfLines={1} className="flex-1">{m.name}</AppText>
                  <AppText variant="caption" color="muted" className="capitalize">{muscleLabel(m.muscle_group)}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <ChipGroup label={t('exercises.custom.sheet.muscle')} error={muscleError ? t('exercises.custom.sheet.muscleRequired') : undefined}>
            {CUSTOM_EXERCISE_MUSCLES.map((m) => (
              <Chip key={m} role="radio" label={muscleLabel(m)} selected={muscle === m}
                onPress={() => { setMuscle(m); setMuscleError(false); setSecondary((p) => p.filter((x) => x !== m)) }} />
            ))}
          </ChipGroup>

          <ChipGroup label={t('exercises.custom.sheet.equipment')}>
            {CUSTOM_EXERCISE_EQUIPMENT.map((e) => (
              <Chip key={e} role="radio" label={equipmentLabel(e)} selected={equipment === e} onPress={() => setEquipment(e)} />
            ))}
          </ChipGroup>

          {photosOn ? (
            <PhotoField
              exercise={mode === 'edit' ? exercise : undefined}
              staged={staged}
              removed={photoRemoved}
              busy={save.busy || sendPhoto.busy}
              error={pickError}
              onChoose={() => { void choosePhoto(PICK_LIBRARY) }}
              onTake={() => { void choosePhoto(PICK_CAMERA) }}
              onRemove={removePhoto}
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            // react-native-web drops accessibilityState; a disclosure needs aria-expanded.
            {...(Platform.OS === 'web' ? { 'aria-expanded': showMore } : {})}
            onPress={() => setShowMore((v) => !v)}
            style={{ minHeight: TOUCH_MIN }}
            className={`flex-row items-center gap-1.5 self-start active:opacity-60 ${interactive('hover:opacity-80')}`}
          >
            <AppText variant="bodySemibold" color="brand">
              {t(showMore ? 'exercises.custom.sheet.less' : 'exercises.custom.sheet.more')}
            </AppText>
            <MoreIcon size={16} color={colors.txMuted} />
          </Pressable>

          {showMore ? (
            <View className="gap-4">
              <ChipGroup label={t('exercises.custom.sheet.category')}>
                {CUSTOM_EXERCISE_CATEGORIES.map((c) => (
                  <Chip key={c} role="radio" label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(c)} />
                ))}
              </ChipGroup>
              <View className="gap-1.5">
                <AppText variant="label" color="muted">{t('exercises.custom.sheet.otherMuscles')}</AppText>
                <View className="flex-row flex-wrap gap-2">
                  {CUSTOM_EXERCISE_MUSCLES.filter((m) => m !== muscle).map((m) => (
                    <Chip key={m} role="checkbox" label={muscleLabel(m)} selected={secondary.includes(m)} onPress={() => toggleSecondary(m)} />
                  ))}
                </View>
              </View>
              <Field
                label={t('exercises.custom.sheet.notes')}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('exercises.custom.sheet.notesPlaceholder')}
                multiline
                maxLength={2000}
              />
            </View>
          ) : null}

        </ScrollView>
        <View className="gap-3 border-t border-surface-border px-5 pt-3">
          {saved ? (
            <>
              {sendPhoto.error ? (
                <Alert variant="error" size="compact">{`${t('exercises.custom.photo.savedNoPhoto')} ${sendPhoto.error}`}</Alert>
              ) : null}
              <View className="flex-row gap-2">
                <Button className="flex-1" title={t('exercises.custom.photo.tryAgain')} loading={sendPhoto.busy} onPress={() => { void sendPhoto.run(saved) }} />
                <Button className="flex-1" variant="secondary" title={t('exercises.custom.photo.skip')} disabled={sendPhoto.busy} onPress={() => onSaved(saved)} />
              </View>
            </>
          ) : (
            <>
              {save.error ? <Alert variant="error" size="compact">{save.error}</Alert> : null}
              <Button title={label} onPress={submit} loading={save.busy} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  )
}
