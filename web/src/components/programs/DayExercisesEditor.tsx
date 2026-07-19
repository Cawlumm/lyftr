import { useState } from 'react'
import { Plus, Trash2, Zap, Timer } from 'lucide-react'
import WeightInput from '../WeightInput'
import ExercisePicker from '../ExercisePicker'
import RestPicker from '../RestPicker'
import * as types from '../../types'
import type { DayExerciseDraft } from './types'

interface Props {
  exercises: DayExerciseDraft[]
  onChange: (exercises: DayExerciseDraft[]) => void
  pickerExercises: Record<number, types.Exercise>
  onCacheExercise: (ex: types.Exercise) => void
  wUnit: string
  restSecondsDefault: number
}

// The per-exercise editing UI (name/notes/rest/target sets) — unchanged from the
// pre-multi-day flat editor, just parameterized so each Day in ProgramDaysEditor
// gets its own instance instead of the page owning one flat exercises array.
export default function DayExercisesEditor({ exercises, onChange, pickerExercises, onCacheExercise, wUnit, restSecondsDefault }: Props) {
  const [showPicker, setShowPicker] = useState(false)

  const addExercise = (exercise: types.Exercise) => {
    onCacheExercise(exercise)
    onChange([...exercises, {
      exercise_id: exercise.id,
      notes: '',
      rest_seconds: restSecondsDefault,
      sets: [{ set_number: 1, target_reps: 0, target_weight: 0 }],
    }])
    setShowPicker(false)
  }

  const removeExercise = (exIdx: number) => onChange(exercises.filter((_, i) => i !== exIdx))

  const addSet = (exIdx: number) => {
    const next = [...exercises]
    const count = next[exIdx].sets.length + 1
    next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, { set_number: count, target_reps: 0, target_weight: 0 }] }
    onChange(next)
  }

  const removeSet = (exIdx: number, setIdx: number) => {
    const next = [...exercises]
    next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.filter((_, i) => i !== setIdx) }
    onChange(next)
  }

  const updateSet = (exIdx: number, setIdx: number, field: 'target_reps' | 'target_weight', value: any) => {
    const next = [...exercises]
    const sets = [...next[exIdx].sets]
    sets[setIdx] = { ...sets[setIdx], [field]: Number(value) || 0 }
    next[exIdx] = { ...next[exIdx], sets }
    onChange(next)
  }

  const updateNotes = (exIdx: number, notes: string) => {
    const next = [...exercises]
    next[exIdx] = { ...next[exIdx], notes }
    onChange(next)
  }

  const setExRest = (exIdx: number, secs: number) => {
    const next = [...exercises]
    next[exIdx] = { ...next[exIdx], rest_seconds: secs }
    onChange(next)
  }

  const selectedIds = exercises.map(e => e.exercise_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand-500" />
          <label className="label">Exercises</label>
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Exercise
        </button>
      </div>

      {showPicker && (
        <ExercisePicker
          selectedIds={selectedIds}
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}

      {exercises.length === 0 ? (
        <p className="text-xs text-tx-muted text-center py-4">No exercises yet — add one above.</p>
      ) : (
        <div className="space-y-4">
          {exercises.map((workoutEx, exIdx) => {
            const exercise = pickerExercises[workoutEx.exercise_id]
            return (
              <div key={exIdx} className="p-4 bg-surface-muted/30 border border-surface-border rounded-lg">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-brand-500">{exIdx + 1}</span>
                      </div>
                      <p className="font-semibold text-tx-primary">{exercise?.name}</p>
                    </div>
                    <p className="text-xs text-tx-muted ml-8">{exercise?.muscle_group} • {exercise?.equipment}</p>
                  </div>
                  <button type="button" onClick={() => removeExercise(exIdx)} className="p-1.5 hover:bg-error-500/20 rounded transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4 text-error-400" />
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Notes</label>
                  <input
                    type="text"
                    value={workoutEx.notes}
                    onChange={e => updateNotes(exIdx, e.target.value)}
                    placeholder="e.g., Focus on controlled eccentric"
                    className="input text-sm"
                  />
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="w-3.5 h-3.5 text-brand-500" />
                    <label className="text-xs text-tx-muted font-medium uppercase tracking-wider">Rest between sets</label>
                  </div>
                  <RestPicker value={workoutEx.rest_seconds ?? 90} onChange={secs => setExRest(exIdx, secs)} />
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-tx-muted font-medium uppercase tracking-wider">Target Sets</label>
                    <span className="text-xs text-tx-muted">{workoutEx.sets.length} sets</span>
                  </div>
                  {workoutEx.sets.map((set, setIdx) => (
                    <div key={setIdx} className="flex gap-2 items-end bg-surface-raised/40 p-3 rounded-lg border border-surface-border/50">
                      <div className="flex-shrink-0 w-12">
                        <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block">Set</label>
                        <div className="text-sm font-bold text-tx-primary bg-surface-muted px-2 py-1 rounded text-center">{set.set_number}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Target Reps</label>
                        <input type="number" inputMode="numeric" value={set.target_reps || ''} onChange={e => updateSet(exIdx, setIdx, 'target_reps', e.target.value)} placeholder="10" className="input text-sm w-full" min="0" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Target Weight</label>
                        <WeightInput stepper={false} size="sm" value={set.target_weight ? String(set.target_weight) : ''} onChange={v => updateSet(exIdx, setIdx, 'target_weight', v)} unit={wUnit} placeholder="135" />
                      </div>
                      <button type="button" onClick={() => removeSet(exIdx, setIdx)} className="p-2 hover:bg-error-500/20 rounded transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4 text-error-400" />
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={() => addSet(exIdx)} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Add Set
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
