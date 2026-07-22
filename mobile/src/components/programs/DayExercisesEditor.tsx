import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Dumbbell, Plus } from 'lucide-react-native'
import type { Exercise } from '@lyftr/shared'
import { EmptyState } from '../ui'
import { ExerciseFormCard } from '../workouts/ExerciseFormCard'
import { ExercisePicker } from '../workouts/ExercisePicker'
import { useTheme } from '../../theme/useTheme'
import type { DayExerciseDraft } from './types'

interface Props {
  exercises: DayExerciseDraft[]
  onChange: (exercises: DayExerciseDraft[]) => void
  pickerExercises: Record<number, Exercise>
  onCacheExercise: (ex: Exercise) => void
  unit: string
  restSecondsDefault: number
  inputAccessoryViewID?: string
}

// The per-exercise editing UI (name/notes/rest/target sets), unchanged from the
// pre-multi-day flat editor (ExerciseFormCard) — just parameterized so each Day in
// ProgramDaysEditor owns its own instance instead of the screen owning one flat
// exercises array. Port of web/components/programs/DayExercisesEditor.tsx.
export function DayExercisesEditor({
  exercises, onChange, pickerExercises, onCacheExercise, unit, restSecondsDefault, inputAccessoryViewID,
}: Props) {
  const { accent } = useTheme()
  const [showPicker, setShowPicker] = useState(false)

  const addExercise = (exercise: Exercise) => {
    onCacheExercise(exercise)
    onChange([...exercises, {
      exercise_id: exercise.id,
      notes: '',
      rest_seconds: restSecondsDefault,
      sets: [{ set_number: 1, reps: 0, weight: 0 }],
    }])
    setShowPicker(false)
  }

  // Stable + immutable handlers so the memoized ExerciseFormCard only re-renders the
  // edited card (same rationale as the pre-multi-day screens).
  const removeExercise = useCallback((index: number) => onChange(exercises.filter((_, i) => i !== index)), [exercises, onChange])

  const addSet = useCallback((exIdx: number) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, reps: 0, weight: 0 }] })))
  }, [exercises, onChange])

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) })))
  }, [exercises, onChange])

  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: Number(value) || 0 })) })))
  }, [exercises, onChange])

  const updateExNotes = useCallback((exIdx: number, text: string) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, notes: text })))
  }, [exercises, onChange])

  const setExRest = useCallback((exIdx: number, secs: number) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, rest_seconds: secs })))
  }, [exercises, onChange])

  const selectedIds = exercises.map((e) => e.exercise_id)

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowPicker(true)}
        className="mb-3 flex-row items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2.5 active:scale-95"
      >
        <Plus size={13} color="#ffffff" />
        <Text className="font-sans-semibold text-xs text-white">Add Exercise</Text>
      </Pressable>

      {exercises.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-surface-border">
          <EmptyState compact icon={Dumbbell} title="No exercises yet" subtitle="Add an exercise to this day" />
        </View>
      ) : (
        <View className="gap-4">
          {exercises.map((dayEx, exIdx) => (
            <ExerciseFormCard
              key={exIdx}
              index={exIdx}
              exercise={pickerExercises[dayEx.exercise_id]}
              notes={dayEx.notes}
              sets={dayEx.sets}
              restSeconds={dayEx.rest_seconds ?? 90}
              unit={unit}
              onRemove={removeExercise}
              onNotesChange={updateExNotes}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onUpdateSet={updateSet}
              onRestChange={setExRest}
              inputAccessoryViewID={inputAccessoryViewID}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
            onPress={() => setShowPicker(true)}
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-surface-border active:opacity-60"
          >
            <Plus size={14} color={accent} />
            <Text className="font-sans-semibold text-xs" style={{ color: accent }}>Add Exercise</Text>
          </Pressable>
        </View>
      )}

      {showPicker && (
        <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
      )}
    </View>
  )
}
