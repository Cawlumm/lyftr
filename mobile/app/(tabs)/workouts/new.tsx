import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import {
  AlertCircle, ArrowLeft, BookOpen, CalendarDays, Clock, Dumbbell, FileText, Plus, Zap,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { apiErrorMessage, displayToLbs, lbsToDisplay, weightShort, type Exercise, type Program, type ProgramDay } from '@lyftr/shared'
import { AppText, Button, DateInput, EmptyState, Field, IconButton, Label, Screen } from '../../../src/components/ui'
import { ExerciseFormCard } from '../../../src/components/workouts/ExerciseFormCard'
import { DurationField } from '../../../src/components/workouts/DurationField'
import { ExercisePicker } from '../../../src/components/workouts/ExercisePicker'
import { KeyboardDoneBar } from '../../../src/components/workouts/KeyboardDoneBar'
import { ProgramPicker } from '../../../src/components/workouts/ProgramPicker'
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

// One accessory bar per screen — unique ID so a stacked edit screen's bar can't clash.
const KEYPAD_DONE_ID = 'workout-new-keypad-done'

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

  const loadFromProgram = (_program: Program, day: ProgramDay) => {
    const newMap: Record<number, Exercise> = { ...pickerExercises }
    const newExercises = (day.exercises || []).map((ex) => {
      newMap[ex.exercise_id] = ex.exercise
      return {
        exercise_id: ex.exercise_id,
        notes: ex.notes || '',
        rest_seconds: ex.rest_seconds ?? (settings.rest_seconds_default ?? 90),
        sets: (ex.sets || []).map((s) => ({ set_number: s.set_number, reps: s.target_reps, weight: lbsToDisplay(s.target_weight, settings.weight_unit) })),
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

  // These handlers are passed to the memoized ExerciseFormCard, so they must be both
  // referentially STABLE (useCallback with no deps — they only touch the setState updater)
  // and IMMUTABLE (replace only the changed exercise/set with a new object). Immutability
  // is what lets memo work: the edited card gets a fresh `sets`/`notes` ref and re-renders,
  // while every other card keeps its old refs and is skipped.
  const removeExercise = useCallback((index: number) =>
    setFormData((prev) => ({ ...prev, exercises: prev.exercises.filter((_, i) => i !== index) })), [])

  const addSet = useCallback((exIdx: number) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, reps: 0, weight: 0 }] }),
    }))
  }, [])

  // Web parity: removing a middle set does NOT renumber the rest.
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
        i !== exIdx ? ex : {
          ...ex,
          sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: Number(value) || 0 })),
        }),
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
        contentContainerStyle={{ paddingBottom: 24 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        // Drag-to-dismiss the keyboard: 'interactive' (finger-tracked) is iOS-only;
        // Android falls back to dismiss-on-drag-start.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View className="gap-6 py-4">
          {/* Back + title */}
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label="Back" variant="ghost" size="md" onPress={goBack} />
            <View>
              <AppText variant="title">Log Workout</AppText>
              <AppText variant="caption" color="muted">
                {formData.exercises.length} exercises • {totalSets} sets
                {totalWeight > 0 ? ` • ${Math.round(totalWeight)} ${wUnit}` : ''}
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

          {/* Date + duration share a row — related scalar facts, half-width each. The
              duration stepper is a single overflow-hidden container, so it fits the
              half column; DateInput opens its picker in a full-width Modal so the
              half-width trigger doesn't crush the calendar. */}
          <View className="flex-row gap-3">
            <View className="flex-[2]">
              <FieldHeader icon={CalendarDays} label="Date" />
              <DateInput
                value={formData.date}
                onChange={(d) => setFormData((prev) => ({ ...prev, date: d }))}
                maximumDate={new Date()}
              />
            </View>
            <View className="flex-1">
              {/* "min" already rides the value, so the label stays just "Duration". */}
              <FieldHeader icon={Clock} label="Duration" />
              <DurationField
                value={formData.duration}
                onChange={(m) => setFormData((prev) => ({ ...prev, duration: m }))}
                inputAccessoryViewID={KEYPAD_DONE_ID}
              />
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

          {/* Exercises section (no summary strip — the header caption already
              carries exercises · sets · total weight) */}
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

            {formData.exercises.length === 0 && (
              <View className="rounded-2xl border border-dashed border-surface-border">
                <EmptyState
                  compact
                  icon={Dumbbell}
                  title="No exercises yet"
                  subtitle="Add an exercise or load a program to start"
                />
              </View>
            )}

            <View className="gap-4">
              {formData.exercises.map((workoutEx, exIdx) => (
                <ExerciseFormCard
                  key={exIdx}
                  index={exIdx}
                  exercise={pickerExercises[workoutEx.exercise_id]}
                  notes={workoutEx.notes}
                  sets={workoutEx.sets}
                  restSeconds={workoutEx.rest_seconds ?? 90}
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
              {/* Thumb-zone duplicate of Add Exercise: the header buttons scroll away
                  as cards stack up, so the "next exercise" tap lands where the thumb
                  already is (right after the last card) — no scroll-to-top round trip. */}
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

      {/* Sticky footer actions — Save stays reachable however long the form grows.
          -mx-5 lets the divider span edge-to-edge past Screen's px-5. */}
      <View className="-mx-5 flex-row gap-3 border-t border-surface-border bg-surface-base px-5 pb-2 pt-3">
        <Button title="Cancel" variant="secondary" className="flex-1" onPress={goBack} />
        <Button title="Save Workout" className="flex-1" onPress={handleSubmit} loading={loading} />
      </View>

      {/* iOS-only Done bar docked above the numeric keypads (they have no return key). */}
      <KeyboardDoneBar nativeID={KEYPAD_DONE_ID} />

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
