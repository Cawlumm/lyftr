import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import {
  CUSTOM_EXERCISE_CATEGORIES, CUSTOM_EXERCISE_EQUIPMENT, CUSTOM_EXERCISE_MUSCLES, EXERCISE_SEARCH_DEBOUNCE_MS,
  useAsyncAction, useTranslation, type CustomExerciseInput, type Exercise,
} from '@lyftr/shared'
import { ChevronDown, ChevronUp } from '../ui/icons'
import { Alert, AppText, Button, Field, Sheet } from '../ui'
import { interactive, TOUCH_MIN } from '../ui/interaction'
import { client } from '../../lib/lyftr'
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

function Chip({ label, selected, role, onPress }: { label: string; selected: boolean; role: 'radio' | 'checkbox'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ minHeight: TOUCH_MIN }}
      className={`items-center justify-center rounded-full border px-3.5 active:opacity-70 ${
        selected ? 'border-brand-500 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
      } ${interactive('hover:bg-surface-border')}`}
    >
      <AppText variant="bodySemibold" color={selected ? 'primary' : 'secondary'} className="text-[13px]">{label}</AppText>
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

  const save = useAsyncAction(async (input: CustomExerciseInput) => {
    const saved = mode === 'edit' && exercise
      ? await client.exerciseAPI.update(exercise.id, input)
      : await client.exerciseAPI.create(input)
    onSaved(saved)
  }, t('exercises.custom.sheet.saveFailed'))

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
    <Sheet open={open} onClose={onClose} labelledBy={titleId} width="lg">
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

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
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
          {save.error ? <Alert variant="error" size="compact">{save.error}</Alert> : null}
          <Button title={label} onPress={submit} loading={save.busy} />
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  )
}
