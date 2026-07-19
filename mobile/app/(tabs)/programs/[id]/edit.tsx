import { useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AlertCircle, ArrowLeft, BookOpen, CalendarDays, FileText } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { apiErrorMessage, displayToLbs, lbsToDisplay, weightShort, type Exercise } from '@lyftr/shared'
import { AppText, Button, Field, IconButton, Label, Loading, Screen } from '../../../../src/components/ui'
import { KeyboardDoneBar } from '../../../../src/components/workouts/KeyboardDoneBar'
import { ProgramDaysEditor } from '../../../../src/components/programs/ProgramDaysEditor'
import { client, useSettingsStore } from '../../../../src/lib/lyftr'
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
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { brand, isDark } = useTheme()

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerExercises, setPickerExercises] = useState<Record<number, Exercise>>({})
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', days: [] })
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [error])

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
      .catch(() => { if (!cancelled) setError('Failed to load program') })
      .finally(() => { if (!cancelled) setInitialLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/programs'))

  const cacheExercise = (ex: Exercise) => setPickerExercises((prev) => ({ ...prev, [ex.id]: ex }))

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError('Program name required'); return }
    if (formData.days.length === 0) { setError('Add at least one day'); return }
    const hasAnyExercise = formData.days.some((d) => !d.is_rest_day && d.exercises.length > 0)
    if (!hasAnyExercise) { setError('Add at least one exercise to a workout day'); return }
    setLoading(true)
    try {
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
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update program'))
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) return <Loading />

  const totalExercises = formData.days.reduce((s, d) => s + d.exercises.length, 0)
  const totalSets = formData.days.reduce((s, d) => s + d.exercises.reduce((s2, ex) => s2 + ex.sets.length, 0), 0)

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View className="gap-6 py-4">
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label="Back" variant="ghost" size="md" onPress={goBack} />
            <View>
              <AppText variant="title">Edit Program</AppText>
              <AppText variant="caption" color="muted">
                {formData.days.length} days • {totalExercises} exercises • {totalSets} sets
              </AppText>
            </View>
          </View>

          {error ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
              <AlertCircle size={16} color={isDark ? brand.errorSoft : brand.error} />
              <AppText variant="body" color="error" className="flex-1">{error}</AppText>
            </View>
          ) : null}

          <View>
            <FieldHeader icon={BookOpen} label="Program Name" />
            <Field
              value={formData.name}
              onChangeText={(t) => setFormData((prev) => ({ ...prev, name: t }))}
            />
          </View>

          <View>
            <FieldHeader icon={FileText} label="Notes" />
            <Field
              value={formData.notes}
              onChangeText={(t) => setFormData((prev) => ({ ...prev, notes: t }))}
              placeholder="Program description or goals…"
              multiline
            />
          </View>

          <View>
            <View className="mb-3 flex-row items-center gap-2">
              <CalendarDays size={14} color={brand.cyan} strokeWidth={2.2} />
              <Label>Days</Label>
              <AppText variant="caption" color="muted">(repeats in this order)</AppText>
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

      <View className="-mx-5 flex-row gap-3 border-t border-surface-border bg-surface-base px-5 pb-2 pt-3">
        <Button title="Cancel" variant="secondary" className="flex-1" onPress={goBack} />
        <Button title="Save Changes" className="flex-1" onPress={handleSubmit} loading={loading} />
      </View>

      <KeyboardDoneBar nativeID={KEYPAD_DONE_ID} />
    </Screen>
  )
}
