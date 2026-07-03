import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import {
  AlertCircle, ArrowLeft, BookOpen, CalendarDays, Clock, Dumbbell, FileText, Plus, Timer, Trash2, Zap,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { apiErrorMessage, displayToLbs, weightShort, type Exercise, type Program } from '@lyftr/shared'
import { AppText, Button, DateInput, Field, IconButton, Label, Screen } from '../../../src/components/ui'
import { ExercisePicker } from '../../../src/components/workouts/ExercisePicker'
import { ProgramPicker } from '../../../src/components/workouts/ProgramPicker'
import { RestPicker } from '../../../src/components/workouts/RestPicker'
import { WeightInput } from '../../../src/components/workouts/WeightInput'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Same shape as web's WorkoutFormData: weights/duration in DISPLAY units here;
// converted to lbs/seconds only in the submit payload.
interface WorkoutFormData {
  name: string
  notes: string
  duration: number
  date: string
  exercises: {
    exercise_id: number
    notes: string
    rest_seconds: number
    sets: { set_number: number; reps: number; weight: number }[]
  }[]
}

// Compact one-line input for the repeated exercise/set rows — static border, no
// focus glow: it never re-renders on focus (Fabric-safe by construction) and web's
// equivalent rows use the low-key `.input text-sm` too. ui/Field (Reanimated glow)
// is reserved for the top-level fields.
const COMPACT_INPUT = 'h-10 rounded-lg border border-surface-border bg-surface-overlay px-3 font-sans text-sm text-tx-primary'

// Web's icon+label field headers (Dumbbell/CalendarDays/Clock/FileText/Zap rows).
function FieldHeader({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
  // Muted (not accent) field icons: with every header cyan the form reads busy and
  // the accent loses meaning. Restrained neutral glyphs let the brand color stay
  // reserved for real signal (the Exercises section, PR chips, primary CTA).
  const { colors } = useTheme()
  return (
    <View className="mb-2.5 flex-row items-center gap-2">
      <Icon size={14} color={colors.txMuted} strokeWidth={2.2} />
      <Label>{label}</Label>
      {hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}
    </View>
  )
}

export default function AddWorkout() {
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { colors, brand, accent, isDark } = useTheme()

  const [showPicker, setShowPicker] = useState(false)
  const [showProgramPicker, setShowProgramPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pickerExercises, setPickerExercises] = useState<Record<number, Exercise>>({})
  const [formData, setFormData] = useState<WorkoutFormData>({
    name: '',
    notes: '',
    duration: 0,
    date: new Date().toISOString().slice(0, 10),
    exercises: [],
  })
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Web scrolls the window to top on error; here the ScrollView.
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [error])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))

  const loadFromProgram = (program: Program) => {
    const newMap: Record<number, Exercise> = { ...pickerExercises }
    const newExercises = (program.exercises || []).map((ex) => {
      newMap[ex.exercise_id] = ex.exercise
      return {
        exercise_id: ex.exercise_id,
        notes: ex.notes || '',
        rest_seconds: ex.rest_seconds ?? (settings.rest_seconds_default ?? 90),
        // Web parity (latent web quirk, do not fix): target_weight is server-lbs
        // copied straight into the display-unit form — identity for lbs users.
        sets: (ex.sets || []).map((s) => ({ set_number: s.set_number, reps: s.target_reps, weight: s.target_weight })),
      }
    })
    setPickerExercises(newMap)
    setFormData((prev) => ({ ...prev, exercises: newExercises }))
    setShowProgramPicker(false)
    setError('')
  }

  const addExercise = (exercise: Exercise) => {
    setPickerExercises((prev) => ({ ...prev, [exercise.id]: exercise }))
    setFormData((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        {
          exercise_id: exercise.id,
          notes: '',
          rest_seconds: settings.rest_seconds_default ?? 90,
          sets: [{ set_number: 1, reps: 0, weight: 0 }],
        },
      ],
    }))
    setShowPicker(false)
    setError('')
  }

  const removeExercise = (index: number) =>
    setFormData((prev) => ({ ...prev, exercises: prev.exercises.filter((_, i) => i !== index) }))

  const addSet = (exIdx: number) => {
    setFormData((prev) => {
      const exercises = [...prev.exercises]
      exercises[exIdx].sets.push({ set_number: exercises[exIdx].sets.length + 1, reps: 0, weight: 0 })
      return { ...prev, exercises }
    })
  }

  // Web parity: removing a middle set does NOT renumber the rest.
  const removeSet = (exIdx: number, setIdx: number) => {
    setFormData((prev) => {
      const exercises = [...prev.exercises]
      exercises[exIdx].sets = exercises[exIdx].sets.filter((_, i) => i !== setIdx)
      return { ...prev, exercises }
    })
  }

  const updateSet = (exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) => {
    setFormData((prev) => {
      const exercises = [...prev.exercises]
      exercises[exIdx].sets[setIdx][field] = Number(value) || 0
      return { ...prev, exercises }
    })
  }

  const updateExNotes = (exIdx: number, text: string) => {
    setFormData((prev) => {
      const exercises = [...prev.exercises]
      exercises[exIdx] = { ...exercises[exIdx], notes: text }
      return { ...prev, exercises }
    })
  }

  const setExRest = (exIdx: number, secs: number) => {
    setFormData((prev) => {
      const exercises = [...prev.exercises]
      exercises[exIdx] = { ...exercises[exIdx], rest_seconds: secs }
      return { ...prev, exercises }
    })
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError('Workout name required'); return }
    if (formData.exercises.length === 0) { setError('Add at least one exercise'); return }
    setLoading(true)
    try {
      // Exact web payload (the spread leaks `date` — backend ignores it; keep it).
      const payload = {
        ...formData,
        duration: formData.duration * 60,
        started_at: new Date(formData.date).toISOString(),
        exercises: formData.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => ({ ...s, weight: displayToLbs(s.weight, settings.weight_unit) })),
        })),
      }
      await client.workoutAPI.create(payload)
      // Web navigates to /workouts; pop back to the list (it reloads on focus).
      router.dismissTo('/workouts')
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create workout'))
    } finally {
      setLoading(false)
    }
  }

  const selectedIds = formData.exercises.map((e) => e.exercise_id)
  const totalSets = formData.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const totalWeight = formData.exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + (set.weight || 0), 0),
    0
  )

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6 py-4">
          {/* Back + title */}
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label="Back" variant="ghost" size="md" onPress={goBack} />
            <View>
              <AppText variant="title">Log Workout</AppText>
              <AppText variant="caption" color="muted">
                {formData.exercises.length} exercises • {totalSets} sets
              </AppText>
            </View>
          </View>

          {/* Form/request error — boxed alert (authui AuthError pattern) */}
          {error ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
              <AlertCircle size={16} color={isDark ? brand.errorSoft : brand.error} />
              <AppText variant="body" color="error" className="flex-1">{error}</AppText>
            </View>
          ) : null}

          <View>
            <FieldHeader icon={Dumbbell} label="Workout Name" hint="(required)" />
            <Field
              value={formData.name}
              onChangeText={(t) => setFormData((prev) => ({ ...prev, name: t }))}
              placeholder="e.g., Leg Day, Push Day"
            />
          </View>

          <View>
            <FieldHeader icon={CalendarDays} label="Date" />
            <DateInput
              value={formData.date}
              onChange={(d) => setFormData((prev) => ({ ...prev, date: d }))}
              maximumDate={new Date()}
            />
          </View>

          <View>
            <FieldHeader icon={Clock} label="Duration (minutes)" />
            <View className="flex-row gap-3">
              <Field
                className="flex-1"
                value={formData.duration ? String(formData.duration) : ''}
                onChangeText={(t) =>
                  setFormData((prev) => ({ ...prev, duration: Number(t.replace(/[^0-9]/g, '')) || 0 }))
                }
                keyboardType="number-pad"
                returnKeyType="done"
                placeholder="0"
              />
              <View className="flex-1 justify-center rounded-lg bg-surface-muted/30 px-3">
                <AppText variant="body" color="muted">
                  {Math.floor(formData.duration / 60)}h {formData.duration % 60}m
                </AppText>
              </View>
            </View>
          </View>

          <View>
            <FieldHeader icon={FileText} label="Notes" />
            <Field
              value={formData.notes}
              onChangeText={(t) => setFormData((prev) => ({ ...prev, notes: t }))}
              placeholder="How did it feel? Any PRs?"
              multiline
            />
          </View>

          {/* Summary grid (web's 3-col brand strip) */}
          {formData.exercises.length > 0 && (
            <View className="flex-row rounded-lg border border-brand-500/20 bg-brand-500/10 p-3">
              <View className="flex-1 items-center">
                <AppText variant="subheading" color="brand" style={{ fontVariant: ['tabular-nums'] }}>
                  {formData.exercises.length}
                </AppText>
                <AppText variant="caption" color="muted">Exercises</AppText>
              </View>
              <View className="flex-1 items-center">
                <AppText variant="subheading" color="brand" style={{ fontVariant: ['tabular-nums'] }}>
                  {totalSets}
                </AppText>
                <AppText variant="caption" color="muted">Sets</AppText>
              </View>
              <View className="flex-1 items-center">
                <AppText variant="subheading" color="brand" style={{ fontVariant: ['tabular-nums'] }}>
                  {Math.round(totalWeight)}
                </AppText>
                <AppText variant="caption" color="muted">Total {wUnit}</AppText>
              </View>
            </View>
          )}

          {/* Exercises section */}
          <View>
            {/* Label row + full-width button row: label group AND two buttons don't
                fit one 390pt row (the Add button clipped off-screen), and equal-width
                buttons make friendlier touch targets anyway. */}
            <View className="mb-3">
              <View className="mb-2.5 flex-row items-center gap-2">
                <Zap size={14} color={accent} strokeWidth={2.2} />
                <Label>Exercises</Label>
                <AppText variant="caption" color="muted">(required)</AppText>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowProgramPicker(true)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-surface-border bg-surface-muted px-3 py-2.5 active:scale-95"
                >
                  <BookOpen size={13} color={colors.txSecondary} />
                  <Text className="font-sans-semibold text-xs text-tx-secondary">Load Program</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPicker(true)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2.5 active:scale-95"
                >
                  <Plus size={13} color="#ffffff" />
                  <Text className="font-sans-semibold text-xs text-white">Add Exercise</Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-4">
              {formData.exercises.map((workoutEx, exIdx) => {
                const exercise = pickerExercises[workoutEx.exercise_id]
                return (
                  <View key={exIdx} className="rounded-lg border border-surface-border bg-surface-muted/30 p-4">
                    {/* Card header: order badge, name, muscle • equipment, remove */}
                    <View className="mb-4 flex-row items-start justify-between">
                      <View className="flex-1">
                        <View className="mb-1 flex-row items-center gap-2">
                          <View className="h-6 w-6 items-center justify-center rounded bg-brand-500/20">
                            <AppText variant="caption" color="brand" style={{ fontVariant: ['tabular-nums'] }}>
                              {exIdx + 1}
                            </AppText>
                          </View>
                          <AppText variant="bodySemibold" className="flex-1" numberOfLines={1}>
                            {exercise?.name}
                          </AppText>
                        </View>
                        <AppText variant="caption" color="muted" className="ml-8">
                          {exercise?.muscle_group} • {exercise?.equipment}
                        </AppText>
                      </View>
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${exercise?.name ?? 'exercise'}`}
                        variant="danger"
                        size="sm"
                        onPress={() => removeExercise(exIdx)}
                      />
                    </View>

                    {/* Per-exercise notes */}
                    <View className="mb-4">
                      <Label className="mb-1">Notes</Label>
                      <TextInput
                        value={workoutEx.notes}
                        onChangeText={(t) => updateExNotes(exIdx, t)}
                        placeholder="e.g., Felt strong"
                        placeholderTextColor={colors.txMuted}
                        className={COMPACT_INPUT}
                      />
                    </View>

                    {/* Rest between sets */}
                    <View className="mb-4">
                      <View className="mb-1 flex-row items-center gap-1.5">
                        <Timer size={13} color={accent} />
                        <Label>Rest between sets</Label>
                      </View>
                      <RestPicker value={workoutEx.rest_seconds ?? 90} onChange={(secs) => setExRest(exIdx, secs)} />
                    </View>

                    {/* Sets */}
                    <View className="mb-3 gap-2">
                      <View className="flex-row items-center justify-between">
                        <Label>Sets</Label>
                        <AppText variant="caption" color="muted">{workoutEx.sets.length} sets</AppText>
                      </View>
                      {workoutEx.sets.map((set, setIdx) => (
                        <View
                          key={setIdx}
                          className="flex-row items-end gap-2 rounded-lg border border-surface-border/50 bg-surface-raised/40 p-3"
                        >
                          <View className="w-10">
                            <Label className="mb-1">Set</Label>
                            <View className="items-center rounded bg-surface-muted px-2 py-2">
                              <AppText variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>
                                {set.set_number}
                              </AppText>
                            </View>
                          </View>
                          <View className="flex-1">
                            <Label className="mb-1">Reps</Label>
                            <TextInput
                              value={set.reps ? String(set.reps) : ''}
                              onChangeText={(t) => updateSet(exIdx, setIdx, 'reps', t.replace(/[^0-9]/g, ''))}
                              keyboardType="number-pad"
                              returnKeyType="done"
                              placeholder="10"
                              placeholderTextColor={colors.txMuted}
                              accessibilityLabel="Set reps"
                              className={`${COMPACT_INPUT} text-center`}
                              style={{ fontVariant: ['tabular-nums'] }}
                            />
                          </View>
                          <View className="flex-1">
                            <Label className="mb-1">Weight</Label>
                            <WeightInput
                              value={set.weight ? String(set.weight) : ''}
                              onChange={(v) => updateSet(exIdx, setIdx, 'weight', v)}
                              unit={wUnit}
                              placeholder="225"
                              accessibilityLabel="Set weight"
                            />
                          </View>
                          <IconButton
                            icon={Trash2}
                            label="Remove set"
                            variant="danger"
                            size="sm"
                            className="mb-1"
                            onPress={() => removeSet(exIdx, setIdx)}
                          />
                        </View>
                      ))}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => addSet(exIdx)}
                      className="flex-row items-center gap-1 self-start py-1 active:opacity-60"
                    >
                      <Plus size={13} color={accent} />
                      {/* accent (not text-brand-500): raw brand cyan washes out on light. */}
                      <Text className="font-sans-semibold text-xs" style={{ color: accent }}>Add Set</Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          </View>

          {/* Footer actions */}
          <View className="flex-row gap-3 pt-2">
            <Button title="Cancel" variant="secondary" className="flex-1" onPress={goBack} />
            <Button title="Save Workout" className="flex-1" onPress={handleSubmit} loading={loading} />
          </View>
        </View>
      </ScrollView>

      {/* Conditionally mounted, exactly like web — search state resets per open. */}
      {showPicker && (
        <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
      )}
      {showProgramPicker && (
        <ProgramPicker onSelect={loadFromProgram} onClose={() => setShowProgramPicker(false)} />
      )}
    </Screen>
  )
}
