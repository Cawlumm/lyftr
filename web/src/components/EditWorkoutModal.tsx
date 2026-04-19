import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Trash2, AlertCircle, Dumbbell, Clock, FileText, Zap, Target, Gauge } from 'lucide-react'
import { workoutAPI, exerciseAPI } from '../services/api'
import ExercisePicker from './ExercisePicker'
import * as types from '../types'

interface WorkoutFormData {
  name: string
  notes: string
  duration: number
  exercises: {
    exercise_id: number
    notes: string
    sets: {
      set_number: number
      reps: number
      weight: number
    }[]
  }[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  workoutId: number
}

export default function EditWorkoutModal({ isOpen, onClose, onSuccess, workoutId }: Props) {
  const [pickerExercises, setPickerExercises] = useState<Record<number, types.Exercise>>({})
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [initialLoading, setInitialLoading] = useState(false)

  const [formData, setFormData] = useState<WorkoutFormData>({
    name: '',
    notes: '',
    duration: 0,
    exercises: [],
  })

  useEffect(() => {
    if (!isOpen) return
    loadWorkoutData()
  }, [isOpen, workoutId])

  const loadWorkoutData = async () => {
    setInitialLoading(true)
    try {
      const workout = await workoutAPI.get(workoutId)
      const exerciseMap: Record<number, types.Exercise> = {}
      ;(workout.exercises || []).forEach(ex => {
        exerciseMap[ex.exercise_id] = ex.exercise
      })
      setPickerExercises(exerciseMap)

      setFormData({
        name: workout.name,
        notes: workout.notes || '',
        duration: workout.duration,
        exercises: (workout.exercises || []).map(ex => ({
          exercise_id: ex.exercise_id,
          notes: ex.notes || '',
          sets: (ex.sets || []).map(s => ({
            set_number: s.set_number,
            reps: s.reps,
            weight: s.weight,
          })),
        })),
      })
    } catch (err) {
      console.error('Failed to load workout:', err)
      setError('Failed to load workout')
    } finally {
      setInitialLoading(false)
    }
  }

  const addExercise = (exercise: types.Exercise) => {
    setPickerExercises(prev => ({ ...prev, [exercise.id]: exercise }))
    setFormData({
      ...formData,
      exercises: [
        ...formData.exercises,
        {
          exercise_id: exercise.id,
          notes: '',
          sets: [{ set_number: 1, reps: 0, weight: 0 }],
        },
      ],
    })
    setShowPicker(false)
    setError('')
  }

  const removeExercise = (index: number) => {
    setFormData({
      ...formData,
      exercises: formData.exercises.filter((_, i) => i !== index),
    })
  }

  const addSet = (exerciseIndex: number) => {
    const newExercises = [...formData.exercises]
    const setCount = newExercises[exerciseIndex].sets.length + 1
    newExercises[exerciseIndex].sets.push({
      set_number: setCount,
      reps: 0,
      weight: 0,
    })
    setFormData({ ...formData, exercises: newExercises })
  }

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...formData.exercises]
    newExercises[exerciseIndex].sets = newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex)
    setFormData({ ...formData, exercises: newExercises })
  }

  const updateSet = (exerciseIndex: number, setIndex: number, field: string, value: any) => {
    const newExercises = [...formData.exercises]
    ;(newExercises[exerciseIndex].sets[setIndex] as any)[field] = field === 'reps' || field === 'weight' ? Number(value) || 0 : value
    setFormData({ ...formData, exercises: newExercises })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Workout name required')
      return
    }
    if (formData.exercises.length === 0) {
      setError('Add at least one exercise')
      return
    }

    setLoading(true)
    try {
      await workoutAPI.update(workoutId, {
        name: formData.name,
        notes: formData.notes,
        duration: formData.duration,
        exercises: formData.exercises,
        started_at: new Date().toISOString(),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update workout')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const selectedExerciseIds = formData.exercises.map(e => e.exercise_id)
  const totalSets = formData.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const totalWeight = formData.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s, set) => s + (set.weight || 0), 0), 0)

  if (initialLoading) {
    return createPortal((
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-h-[90vh] sm:max-w-2xl overflow-y-auto">
          <div className="sticky top-0 border-b border-surface-border bg-surface-base px-5 py-4 flex items-center justify-between">
            <h2 className="font-display font-bold text-xl text-tx-primary">Edit Workout</h2>
            <button onClick={onClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
              <X className="w-5 h-5 text-tx-muted" />
            </button>
          </div>
          <div className="p-5 flex items-center justify-center h-32">
            <div className="animate-spin">
              <Dumbbell className="w-6 h-6 text-brand-500" />
            </div>
          </div>
        </div>
      </div>
    ), document.body)
  }

  return createPortal((
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-h-[90vh] sm:max-w-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 border-b border-surface-border bg-surface-base px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-xl text-tx-primary">Edit Workout</h2>
            <p className="text-xs text-tx-muted mt-1">{formData.exercises.length} exercises • {totalSets} sets</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-tx-muted" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Workout name */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Dumbbell className="w-4 h-4 text-brand-500" />
              <label className="label">Workout Name</label>
              <span className="text-xs text-tx-muted">(required)</span>
            </div>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Leg Day, Push Day, Cardio Session"
              className="input mt-1"
            />
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-brand-500" />
              <label className="label">Duration</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-tx-muted font-medium block mb-1">Minutes</label>
                <input
                  type="number"
                  value={formData.duration || ''}
                  onChange={e => setFormData({ ...formData, duration: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="input w-full"
                  min="0"
                />
              </div>
              <div className="flex items-end">
                <div className="text-sm text-tx-muted py-2 px-3 bg-surface-muted/30 rounded-lg w-full text-center font-medium">
                  {Math.floor(formData.duration / 60)}h {formData.duration % 60}m
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-brand-500" />
              <label className="label">Notes</label>
            </div>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="How did it feel? Any PRs? Energy level?"
              className="input mt-1 min-h-20 resize-none"
            />
          </div>

          {/* Workout Summary */}
          {formData.exercises.length > 0 && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Zap className="w-3.5 h-3.5 text-brand-500" />
                </div>
                <div className="text-sm font-bold text-brand-500">{formData.exercises.length}</div>
                <div className="text-xs text-tx-muted">Exercises</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target className="w-3.5 h-3.5 text-brand-500" />
                </div>
                <div className="text-sm font-bold text-brand-500">{totalSets}</div>
                <div className="text-xs text-tx-muted">Sets</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Gauge className="w-3.5 h-3.5 text-brand-500" />
                </div>
                <div className="text-sm font-bold text-brand-500">{Math.round(totalWeight)}</div>
                <div className="text-xs text-tx-muted">Total lbs</div>
              </div>
            </div>
          )}

          {/* Exercises */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" />
                <label className="label">Exercises</label>
                <span className="text-xs text-tx-muted">(required)</span>
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
                selectedIds={selectedExerciseIds}
                onSelect={addExercise}
                onClose={() => setShowPicker(false)}
              />
            )}

            {/* Selected exercises */}
            <div className="space-y-4">
              {formData.exercises.map((workoutEx, exIdx) => {
                const exercise = pickerExercises[workoutEx.exercise_id]
                return (
                  <div key={exIdx} className="p-4 bg-surface-muted/30 border border-surface-border rounded-lg">
                    {/* Exercise header */}
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
                      <button
                        type="button"
                        onClick={() => removeExercise(exIdx)}
                        className="p-1.5 hover:bg-error-500/20 rounded transition-colors flex-shrink-0"
                        title="Remove exercise"
                      >
                        <Trash2 className="w-4 h-4 text-error-400" />
                      </button>
                    </div>

                    {/* Exercise notes */}
                    <div className="mb-4">
                      <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Notes</label>
                      <input
                        type="text"
                        value={workoutEx.notes}
                        onChange={e => {
                          const newExercises = [...formData.exercises]
                          newExercises[exIdx].notes = e.target.value
                          setFormData({ ...formData, exercises: newExercises })
                        }}
                        placeholder="e.g., Felt strong, good form"
                        className="input text-sm"
                      />
                    </div>

                    {/* Sets */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-tx-muted font-medium uppercase tracking-wider">Sets</label>
                        <span className="text-xs text-tx-muted">{workoutEx.sets.length} sets</span>
                      </div>
                      {workoutEx.sets.map((set, setIdx) => (
                        <div key={setIdx} className="flex gap-2 items-end bg-surface-raised/40 p-3 rounded-lg border border-surface-border/50">
                          {/* Set number */}
                          <div className="flex-shrink-0 w-12">
                            <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block">Set</label>
                            <div className="text-sm font-bold text-tx-primary bg-surface-muted px-2 py-1 rounded text-center">
                              {set.set_number}
                            </div>
                          </div>

                          {/* Reps */}
                          <div className="flex-1 min-w-0">
                            <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Reps</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={set.reps || ''}
                              onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                              placeholder="10"
                              className="input text-sm w-full"
                              min="0"
                            />
                          </div>

                          {/* Weight */}
                          <div className="flex-1 min-w-0">
                            <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Weight</label>
                            <div className="relative">
                              <input
                                type="number"
                                inputMode="decimal"
                                value={set.weight || ''}
                                onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                                placeholder="225"
                                className="input text-sm w-full pr-7"
                                min="0"
                                step="0.5"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-tx-muted font-medium pointer-events-none">
                                lbs
                              </span>
                            </div>
                          </div>

                          {/* Remove set button */}
                          <button
                            type="button"
                            onClick={() => removeSet(exIdx, setIdx)}
                            className="p-2 hover:bg-error-500/20 rounded transition-colors flex-shrink-0"
                            title="Remove set"
                          >
                            <Trash2 className="w-4 h-4 text-error-400" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add set button */}
                    <button
                      type="button"
                      onClick={() => addSet(exIdx)}
                      className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Set
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Submit buttons */}
          <div className="flex gap-3 sticky bottom-0 bg-surface-base pt-4 border-t border-surface-border -mx-5 px-5 pb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Dumbbell className="w-4 h-4" />
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ), document.body)
}
