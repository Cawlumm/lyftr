import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AlertCircle, ArrowLeft, BookOpen, Dumbbell, FileText, Plus, Zap } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { apiErrorMessage, displayToLbs, lbsToDisplay, weightShort, type Exercise } from '@lyftr/shared'
import { AppText, Button, EmptyState, Field, IconButton, Label, Loading, Screen } from '../../../../src/components/ui'
import { ExerciseFormCard } from '../../../../src/components/workouts/ExerciseFormCard'
import { ExercisePicker } from '../../../../src/components/workouts/ExercisePicker'
import { KeyboardDoneBar } from '../../../../src/components/workouts/KeyboardDoneBar'
import { client, useSettingsStore } from '../../../../src/lib/lyftr'
import { useTheme } from '../../../../src/theme/useTheme'

interface ProgramFormData {
  name: string
  notes: string
  exercises: {
    exercise_id: number
    notes: string
    rest_seconds: number
    sets: { set_number: number; reps: number; weight: number }[]
  }[]
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
  const { accent, brand, isDark } = useTheme()

  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerExercises, setPickerExercises] = useState<Record<number, Exercise>>({})
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', exercises: [] })
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
        ;(p.exercises || []).forEach((ex) => { map[ex.exercise_id] = ex.exercise })
        setPickerExercises(map)
        setFormData({
          name: p.name,
          notes: p.notes || '',
          exercises: (p.exercises || []).map((ex) => ({
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
        })
      })
      .catch(() => { if (!cancelled) setError('Failed to load program') })
      .finally(() => { if (!cancelled) setInitialLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/programs'))

  const addExercise = (exercise: Exercise) => {
    setPickerExercises((prev) => ({ ...prev, [exercise.id]: exercise }))
    setFormData((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        { exercise_id: exercise.id, notes: '', rest_seconds: settings.rest_seconds_default ?? 90, sets: [{ set_number: 1, reps: 0, weight: 0 }] },
      ],
    }))
    setShowPicker(false)
    setError('')
  }

  const removeExercise = useCallback((index: number) =>
    setFormData((prev) => ({ ...prev, exercises: prev.exercises.filter((_, i) => i !== index) })), [])

  const addSet = useCallback((exIdx: number) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, reps: 0, weight: 0 }] }),
    }))
  }, [])

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }),
    }))
  }, [])

  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: Number(value) || 0 })) }),
    }))
  }, [])

  const updateExNotes = useCallback((exIdx: number, text: string) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, notes: text })),
    }))
  }, [])

  const setExRest = useCallback((exIdx: number, secs: number) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, rest_seconds: secs })),
    }))
  }, [])

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError('Program name required'); return }
    if (formData.exercises.length === 0) { setError('Add at least one exercise'); return }
    setLoading(true)
    try {
      const payload = {
        name: formData.name,
        notes: formData.notes,
        exercises: formData.exercises.map((ex) => ({
          exercise_id: ex.exercise_id,
          notes: ex.notes,
          rest_seconds: ex.rest_seconds,
          sets: ex.sets.map((s) => ({
            set_number: s.set_number,
            target_reps: s.reps,
            target_weight: displayToLbs(s.weight, settings.weight_unit),
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

  const selectedIds = formData.exercises.map((e) => e.exercise_id)
  const totalSets = formData.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)

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
                {formData.exercises.length} exercises • {totalSets} sets
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
            <View className="mb-3">
              <View className="mb-2.5 flex-row items-center gap-2">
                <Zap size={14} color={accent} strokeWidth={2.2} />
                <Label>Exercises</Label>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowPicker(true)}
                className="flex-row items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2.5 active:scale-95"
              >
                <Plus size={13} color="#ffffff" />
                <Text className="font-sans-semibold text-xs text-white">Add Exercise</Text>
              </Pressable>
            </View>

            {formData.exercises.length === 0 && (
              <View className="rounded-2xl border border-dashed border-surface-border">
                <EmptyState
                  compact
                  icon={Dumbbell}
                  title="No exercises yet"
                  subtitle="Add an exercise to build your program"
                />
              </View>
            )}

            <View className="gap-4">
              {formData.exercises.map((programEx, exIdx) => (
                <ExerciseFormCard
                  key={exIdx}
                  index={exIdx}
                  exercise={pickerExercises[programEx.exercise_id]}
                  notes={programEx.notes}
                  sets={programEx.sets}
                  restSeconds={programEx.rest_seconds ?? 90}
                  unit={wUnit}
                  onRemove={removeExercise}
                  onNotesChange={updateExNotes}
                  onAddSet={addSet}
                  onRemoveSet={removeSet}
                  onUpdateSet={updateSet}
                  onRestChange={setExRest}
                  inputAccessoryViewID={KEYPAD_DONE_ID}
                />
              ))}
              {formData.exercises.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add exercise"
                  onPress={() => setShowPicker(true)}
                  className="h-11 flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-surface-border active:opacity-60"
                >
                  <Plus size={14} color={accent} />
                  <Text className="font-sans-semibold text-xs" style={{ color: accent }}>Add Exercise</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="-mx-5 flex-row gap-3 border-t border-surface-border bg-surface-base px-5 pb-2 pt-3">
        <Button title="Cancel" variant="secondary" className="flex-1" onPress={goBack} />
        <Button title="Save Changes" className="flex-1" onPress={handleSubmit} loading={loading} />
      </View>

      <KeyboardDoneBar nativeID={KEYPAD_DONE_ID} />

      {showPicker && (
        <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
      )}
    </Screen>
  )
}
