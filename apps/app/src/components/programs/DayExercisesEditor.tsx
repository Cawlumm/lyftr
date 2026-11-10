import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Dumbbell, Plus } from '../ui/icons'
import {
  moveItem, normaliseSupersets, occurrenceKeys, useTranslation, type Exercise,
} from '@lyftr/shared'
import { EmptyState, TOUCH_MIN, touchTarget } from '../ui'
import { ExerciseFormList } from '../workouts/ExerciseFormCard'
import { ExercisePicker } from '../workouts/ExercisePicker'
import { ReorderButton, ReorderExercisesSheet } from '../workouts/ReorderExercisesSheet'
import { useStableCallback } from '../../hooks/useStableCallback'
import { useTheme } from '../../theme/useTheme'
import type { DayExerciseDraft } from './types'

// Full width, so only the 36px height is padded out.
const ADD_EXERCISE = touchTarget(TOUCH_MIN, 36)

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
  const { t } = useTranslation()
  const { accent } = useTheme()
  const [showPicker, setShowPicker] = useState(false)
  const [showReorder, setShowReorder] = useState(false)

  const addExercise = (exercise: Exercise) => {
    onCacheExercise(exercise)
    onChange([...exercises, {
      exercise_id: exercise.id,
      notes: '',
      rest_seconds: restSecondsDefault,
      sets: [{ set_number: 1, reps: 0, weight: 0 }],
      superset_group: null,
    }])
    setShowPicker(false)
  }

  // useStableCallback (not plain useCallback): these read `exercises`/`onChange`
  // straight from props, but must keep a permanently stable identity — otherwise
  // every edit (any set/notes/rest change anywhere) hands ExerciseFormCard a new
  // handler prop, which invalidates its memo for every card, not just the edited
  // one (the visible lag when a program has many exercises).
  const removeExercise = useStableCallback((index: number) =>
    onChange(normaliseSupersets(exercises.filter((_, i) => i !== index))))

  const addSet = useStableCallback((exIdx: number) => {
    onChange(exercises.map((ex, i) => {
      if (i !== exIdx) return ex
      const last = ex.sets[ex.sets.length - 1]
      return { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, reps: last?.reps ?? 0, weight: last?.weight ?? 0 }] }
    }))
  })

  const removeSet = useStableCallback((exIdx: number, setIdx: number) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) })))
  })

  const updateSet = useStableCallback((exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: Number(value) || 0 })) })))
  })

  const updateExNotes = useStableCallback((exIdx: number, text: string) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, notes: text })))
  })

  const setExRest = useStableCallback((exIdx: number, secs: number) => {
    onChange(exercises.map((ex, i) => (i !== exIdx ? ex : { ...ex, rest_seconds: secs })))
  })

  const openReorder = useStableCallback(() => setShowReorder(true))
  const moveExercise = useStableCallback((from: number, to: number) =>
    onChange(normaliseSupersets(moveItem(exercises, from, to))))

  const rewrite = useStableCallback((fn: (rows: DayExerciseDraft[]) => DayExerciseDraft[]) => onChange(fn(exercises)))

  const selectedIds = exercises.map((e) => e.exercise_id)
  const rowKeys = occurrenceKeys(selectedIds)

  return (
    <View>
      <View className="mb-3 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPicker(true)}
          style={ADD_EXERCISE.style}
          className={`flex-1 active:scale-95 ${ADD_EXERCISE.outer}`}
        >
          <View className={`flex-row items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2.5 group-hover/hit:bg-brand-600 ${ADD_EXERCISE.inner}`}>
            <Plus size={13} color="#ffffff" />
            <Text className="font-sans-semibold text-xs text-white">{t('common.addExercise')}</Text>
          </View>
        </Pressable>
        {exercises.length > 1 ? <ReorderButton onPress={openReorder} /> : null}
      </View>

      {exercises.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-surface-border">
          <EmptyState compact icon={Dumbbell} title={t('programs.form.dayEditor.emptyTitle')} subtitle={t('programs.form.dayEditor.emptySubtitle')} />
        </View>
      ) : (
        <View className="gap-4">
          <ExerciseFormList
            exercises={exercises}
            rowKeys={rowKeys}
            pickerExercises={pickerExercises}
            unit={unit}
            onRewrite={rewrite}
            onRemove={removeExercise}
            onNotesChange={updateExNotes}
            onAddSet={addSet}
            onRemoveSet={removeSet}
            onUpdateSet={updateSet}
            onRestChange={setExRest}
            inputAccessoryViewID={inputAccessoryViewID}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workouts.form.addExerciseLabel')}
            onPress={() => setShowPicker(true)}
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-surface-border active:opacity-60"
          >
            <Plus size={14} color={accent} />
            <Text className="font-sans-semibold text-xs" style={{ color: accent }}>{t('common.addExercise')}</Text>
          </Pressable>
        </View>
      )}

      {showPicker && (
        <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
      )}
      <ReorderExercisesSheet
        open={showReorder}
        names={exercises.map((e) => pickerExercises[e.exercise_id]?.name ?? t('workouts.form.exerciseFallback'))}
        rowKeys={rowKeys}
        groups={exercises.map((e) => e.superset_group)}
        onMove={moveExercise}
        onClose={() => setShowReorder(false)}
      />
    </View>
  )
}
