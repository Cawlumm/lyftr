import { useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, View, type ScrollViewInstance } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AlertCircle, ArrowLeft, BookOpen, CalendarDays, FileText } from '../../../../src/components/ui/icons'
import type { LucideIcon } from '../../../../src/components/ui/icons'
import { useAsyncAction, displayToLbs, hasWorkoutExercises, lbsToDisplay, weightShort, uiMessage, useTranslation, type Exercise, type UiMessage } from '@lyftr/shared'
import { AppText, Button, ErrorState, Field, IconButton, Label, Loading, Screen, scrollBleed } from '../../../../src/components/ui'
import { KeyboardDoneBar } from '../../../../src/components/workouts/KeyboardDoneBar'
import { ProgramDaysEditor } from '../../../../src/components/programs/ProgramDaysEditor'
import { client, useSettingsStore } from '../../../../src/lib/lyftr'
import { useBreakpoint } from '../../../../src/lib/useBreakpoint'
import { useMotion } from '../../../../src/lib/useMotion'
import { useTheme } from '../../../../src/theme/useTheme'
import type { DayDraft } from '../../../../src/components/programs/types'

interface ProgramFormData {
  name: string
  notes: string
  days: DayDraft[]
}

const KEYPAD_DONE_ID = 'program-edit-keypad-done'

function FieldHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const { colors } = useTheme()
  return (
    <View className="mb-2.5 flex-row items-center gap-2">
      <Icon size={14} color={colors.txMuted} strokeWidth={2.2} />
      <Label>{label}</Label>
    </View>
  )
}

export default function EditProgram() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { brand, isDark } = useTheme()
  const { lg } = useBreakpoint()
  // Web from lg: the form actions size to their labels.
  const wide = Platform.OS === 'web' && lg
  // The browser does not drop smooth scrolling for reduced motion on its own; native keeps
  // the animated scroll it always had.
  const { reduced } = useMotion()
  const smooth = !(Platform.OS === 'web' && reduced)

  const [initialLoading, setInitialLoading] = useState(true)
  // Only what the FORM can say before anything is sent. What the SERVER says lives
  // on `save` below; both render in the same alert.
  const [error, setError] = useState<UiMessage | null>(null)
  // Separate from `error`, which is this form's own validation. A load that never
  // arrived is not a missing field — there is nothing to edit.
  const [loadError, setLoadError] = useState<UiMessage | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [pickerExercises, setPickerExercises] = useState<Record<number, Exercise>>({})
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', days: [] })
  const scrollRef = useRef<ScrollViewInstance>(null)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])


  useEffect(() => {
    const programId = Number(id)
    if (!programId) { router.replace('/programs'); return }
    let cancelled = false
    client.programAPI.get(programId)
      .then((p) => {
        if (cancelled) return
        const map: Record<number, Exercise> = {}
        ;(p.days || []).forEach((d) => (d.exercises || []).forEach((ex) => { map[ex.exercise_id] = ex.exercise }))
        setPickerExercises(map)
        setFormData({
          name: p.name,
          notes: p.notes || '',
          days: (p.days || []).map((d, i) => ({
            id: d.id,
            order_index: d.order_index ?? i,
            is_rest_day: d.is_rest_day,
            name: d.name || '',
            exercises: (d.exercises || []).map((ex) => ({
              exercise_id: ex.exercise_id,
              notes: ex.notes || '',
              rest_seconds: ex.rest_seconds ?? (settings.rest_seconds_default ?? 90),
              sets: (ex.sets || []).map((s) => ({
                set_number: s.set_number,
                reps: s.target_reps,
                // Web parity: unrounded prefill (kg users see long decimals).
                weight: lbsToDisplay(s.target_weight, settings.weight_unit),
              })),
            })),
          })),
        })
      })
      .catch((err) => { if (!cancelled) setLoadError({ key: 'errors.unknown', cause: err }) })
      .finally(() => { if (!cancelled) setInitialLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retryKey])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/programs'))

  const cacheExercise = (ex: Exercise) => setPickerExercises((prev) => ({ ...prev, [ex.id]: ex }))

  const save = useAsyncAction(async () => {
    const payload = {
    name: formData.name,
    notes: formData.notes,
    // Declares this client round-trips day ids: without it, deleting every
    // existing day and adding only new (id-less) ones is indistinguishable
    // from a legacy payload and the server would positionally re-attribute
    // the deleted days' workout history to the new days.
    day_ids_known: true,
    days: formData.days.map((d) => ({
    id: d.id,
    order_index: d.order_index,
    is_rest_day: d.is_rest_day,
    name: d.name,
    exercises: d.exercises.map((ex) => ({
    exercise_id: ex.exercise_id,
    notes: ex.notes,
    rest_seconds: ex.rest_seconds,
    sets: ex.sets.map((s) => ({
    set_number: s.set_number,
    target_reps: s.reps,
    target_weight: displayToLbs(s.weight, settings.weight_unit),
    })),
    })),
    })),
    }
    await client.programAPI.update(Number(id), payload)
    router.dismissTo('/programs')
  }, t('programs.form.updateFailed'))

  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: smooth })
  }, [error, smooth])

  useEffect(() => {
    if (save.failureKey) scrollRef.current?.scrollTo({ y: 0, animated: smooth })
  }, [save.failureKey, smooth])

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError({ key: 'programs.form.errors.nameRequired' }); return }
    if (formData.days.length === 0) { setError({ key: 'programs.form.errors.noDays' }); return }
    const hasAnyExercise = hasWorkoutExercises(formData.days)
    if (!hasAnyExercise) { setError({ key: 'programs.form.errors.noExercises' }); return }
    setError(null)
    void save.run()
  }

  if (loadError) {
    return (
      <Screen maxWidth="medium">
        <ErrorState
          size="page"
          title={t('programs.detail.loadFailed')}
          message={uiMessage(loadError)}
          onRetry={() => { setLoadError(null); setRetryKey((k) => k + 1) }}
          secondary={<Button title={t('programs.detail.backToPrograms')} variant="secondary" onPress={goBack} />}
        />
      </Screen>
    )
  }

  if (initialLoading) return <Loading />

  const totalExercises = formData.days.reduce((s, d) => s + d.exercises.length, 0)
  const totalSets = formData.days.reduce((s, d) => s + d.exercises.reduce((s2, ex) => s2 + ex.sets.length, 0), 0)

  return (
    <Screen maxWidth="medium">
      <ScrollView
        ref={scrollRef}
        style={scrollBleed} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View className="gap-6 py-4">
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label={t('common.goBack')} variant="ghost" size="md" onPress={goBack} />
            <View>
              <AppText variant="title">{t('programs.form.editTitle')}</AppText>
              <AppText variant="caption" color="muted">
                {t('programs.form.summary', { days: t('common.count.days', { count: formData.days.length }), exercises: t('common.count.exercises', { count: totalExercises }), sets: t('common.count.sets', { count: totalSets }) })}
              </AppText>
            </View>
          </View>

          {error || save.error ? (
            <View role={Platform.OS === 'web' ? 'alert' : undefined} className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
              <AlertCircle size={16} color={isDark ? brand.errorSoft : brand.error} />
              <AppText variant="body" color="error" className="flex-1">{error ? uiMessage(error) : save.error}</AppText>
            </View>
          ) : null}

          <View>
            <FieldHeader icon={BookOpen} label={t('programs.form.name')} />
            <Field
              // The header above is not tied to the input in the DOM, so web names it here.
              accessibilityLabel={Platform.OS === 'web' ? t('programs.form.name') : undefined}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
            />
          </View>

          <View>
            <FieldHeader icon={FileText} label={t('common.notes')} />
            <Field
              accessibilityLabel={Platform.OS === 'web' ? t('common.notes') : undefined}
              value={formData.notes}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, notes: text }))}
              placeholder={t('programs.form.notesPlaceholder')}
              multiline
            />
          </View>

          <View>
            <View className="mb-3 flex-row items-center gap-2">
              <CalendarDays size={14} color={brand.cyan} strokeWidth={2.2} />
              <Label>{t('programs.form.days')}</Label>
              <AppText variant="caption" color="muted">{t('programs.form.daysHintEdit')}</AppText>
            </View>
            <ProgramDaysEditor
              days={formData.days}
              onChange={(days) => setFormData((prev) => ({ ...prev, days }))}
              pickerExercises={pickerExercises}
              onCacheExercise={cacheExercise}
              unit={wUnit}
              restSecondsDefault={settings.rest_seconds_default ?? 90}
              inputAccessoryViewID={KEYPAD_DONE_ID}
            />
          </View>
        </View>
      </ScrollView>

      <View className={`-mx-5 flex-row gap-3 border-t border-surface-border bg-surface-base px-5 pb-2 pt-3 ${wide ? 'justify-end' : ''}`}>
        <Button title={t('common.cancel')} variant="secondary" className={wide ? 'min-w-32' : 'flex-1'} onPress={goBack} />
        <Button title={t('common.saveChanges')} className={wide ? 'min-w-40' : 'flex-1'} onPress={handleSubmit} loading={save.busy} />
      </View>

      <KeyboardDoneBar nativeID={KEYPAD_DONE_ID} />
    </Screen>
  )
}
