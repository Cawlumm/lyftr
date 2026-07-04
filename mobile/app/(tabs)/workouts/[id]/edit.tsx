import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  AlertCircle, ArrowLeft, CalendarDays, Clock, Dumbbell, FileText, Plus, Zap,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  apiErrorMessage, displayToLbs, lbsToDisplay, weightShort, type Exercise,
} from '@lyftr/shared'
import { AppText, Button, DateInput, EmptyState, Field, IconButton, Label, Loading, Screen } from '../../../../src/components/ui'
import { ExerciseFormCard } from '../../../../src/components/workouts/ExerciseFormCard'
import { DurationField } from '../../../../src/components/workouts/DurationField'
import { ExercisePicker } from '../../../../src/components/workouts/ExercisePicker'
import { KeyboardDoneBar } from '../../../../src/components/workouts/KeyboardDoneBar'
import { client, useSettingsStore } from '../../../../src/lib/lyftr'
import { useTheme } from '../../../../src/theme/useTheme'

// Edit-form shape. Mobile is a superset of web's edit form: it lets you correct the
// workout's `date` (local YYYY-MM-DD) and per-exercise `rest_seconds` too. Weights/
// duration in DISPLAY units; converted on submit.
interface WorkoutFormData {
  name: string
  notes: string
  date: string
  duration: number
  exercises: {
    exercise_id: number
    notes: string
    rest_seconds: number
    sets: { set_number: number; reps: number; weight: number }[]
  }[]
}

// One accessory bar per screen — unique ID so a stacked log screen's bar can't clash.
const KEYPAD_DONE_ID = 'workout-edit-keypad-done'

// started_at (full ISO timestamp) ⇄ the DateInput's local calendar date. Editing the
// date should only move the *day* — the original time-of-day is preserved so a
// workout logged at 6pm doesn't jump to midnight just because the date was touched.
const pad = (n: number) => String(n).padStart(2, '0')
const startedAtToDate = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const applyDateKeepTime = (iso: string, ymd: string): string => {
  const orig = new Date(iso)
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, orig.getHours(), orig.getMinutes(), orig.getSeconds()).toISOString()
}

function FieldHeader({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
  // Muted (not accent) field icons — matches new.tsx: with every header cyan the
  // form reads busy; the accent stays reserved for the Exercises section + CTA.
  const { colors } = useTheme()
  return (
    <View className="mb-2 flex-row items-center gap-2">
      <Icon size={14} color={colors.txMuted} strokeWidth={2.2} />
      <Label>{label}</Label>
      {hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}
    </View>
  )
}

export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { colors, brand, accent, isDark } = useTheme()

  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerExercises, setPickerExercises] = useState<Record<number, Exercise>>({})
  const [formData, setFormData] = useState<WorkoutFormData>({ name: '', notes: '', date: '', duration: 0, exercises: [] })
  const [originalStartedAt, setOriginalStartedAt] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [error])

  useEffect(() => {
    const workoutId = Number(id)
    if (!workoutId) {
      router.replace('/workouts')
      return
    }
    client.workoutAPI.get(workoutId)
      .then((workout) => {
        const map: Record<number, Exercise> = {}
        ;(workout.exercises || []).forEach((ex) => { map[ex.exercise_id] = ex.exercise })
        setPickerExercises(map)
        // Keep the original timestamp so an untouched date round-trips exactly; the
        // date field only overrides the day-of when the user changes it.
        const startedAt = workout.started_at || new Date().toISOString()
        setOriginalStartedAt(startedAt)
        setFormData({
          name: workout.name,
          notes: workout.notes || '',
          date: startedAtToDate(startedAt),
          duration: Math.round(workout.duration / 60),
          exercises: (workout.exercises || []).map((ex) => ({
            exercise_id: ex.exercise_id,
            notes: ex.notes || '',
            rest_seconds: ex.rest_seconds ?? (settings.rest_seconds_default ?? 90),
            // Web parity: unrounded lbsToDisplay prefill (kg users see long decimals).
            sets: (ex.sets || []).map((s) => ({
              set_number: s.set_number,
              reps: s.reps,
              weight: lbsToDisplay(s.weight, settings.weight_unit),
            })),
          })),
        })
      })
      .catch(() => setError('Failed to load workout'))
      .finally(() => setInitialLoading(false))
    // Web effect deps: [id] only — settings are fetched before a user can navigate here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))

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

  // Stable + immutable so the memoized ExerciseFormCard only re-renders the edited card,
  // not all N of them, on each keystroke/tap. See the matching note in new.tsx.
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
        i !== exIdx ? ex : {
          ...ex,
          sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: Number(value) || 0 })),
        }),
    }))
  }, [])

  const setExRest = useCallback((exIdx: number, secs: number) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, rest_seconds: secs })),
    }))
  }, [])

  const updateExNotes = useCallback((exIdx: number, text: string) => {
    setFormData((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, notes: text })),
    }))
  }, [])

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError('Workout name required'); return }
    if (formData.exercises.length === 0) { setError('Add at least one exercise'); return }
    setLoading(true)
    try {
      const payload = {
        ...formData,
        duration: formData.duration * 60,
        // Move only the day; keep the logged time-of-day from the original timestamp.
        started_at: formData.date
          ? applyDateKeepTime(originalStartedAt || new Date().toISOString(), formData.date)
          : originalStartedAt || new Date().toISOString(),
        exercises: formData.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => ({ ...s, weight: displayToLbs(s.weight, settings.weight_unit) })),
        })),
      }
      await client.workoutAPI.update(Number(id), payload)
      // Web navigates to /workouts. Pop past the (stale) detail screen back to the
      // list — the detail refetches on next visit; the list reloads on focus.
      router.dismissTo('/workouts')
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update workout'))
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) return <Loading />


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
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label="Back" variant="ghost" size="md" onPress={goBack} />
            <View>
              <AppText variant="title">Edit Workout</AppText>
              <AppText variant="caption" color="muted">
                {formData.exercises.length} exercises • {totalSets} sets
                {totalWeight > 0 ? ` • ${Math.round(totalWeight)} ${wUnit}` : ''}
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
            <FieldHeader icon={Dumbbell} label="Workout Name" />
            <Field
              value={formData.name}
              onChangeText={(t) => setFormData((prev) => ({ ...prev, name: t }))}
            />
          </View>

          {/* Date + duration share a row (matches the Log form). Editing the date only
              shifts the day; the original time-of-day is preserved on submit. */}
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
              multiline
            />
          </View>

          {/* No summary strip — the header caption already carries exercises · sets · total. */}
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Zap size={14} color={accent} strokeWidth={2.2} />
                <Label>Exercises</Label>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowPicker(true)}
                className="flex-row items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 active:scale-95"
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
                  title="No exercises"
                  subtitle="Add an exercise to this workout"
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
              {/* Thumb-zone duplicate of Add Exercise: the header button scrolls away
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
        <Button title="Save Changes" className="flex-1" onPress={handleSubmit} loading={loading} />
      </View>

      {/* iOS-only Done bar docked above the numeric keypads (they have no return key). */}
      <KeyboardDoneBar nativeID={KEYPAD_DONE_ID} />

      {showPicker && (
        <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
      )}
    </Screen>
  )
}
