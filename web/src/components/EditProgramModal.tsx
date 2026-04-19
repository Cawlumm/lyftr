import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Trash2, AlertCircle, BookOpen, FileText, Zap, Target } from 'lucide-react'
import { programAPI } from '../services/api'
import ExercisePicker from './ExercisePicker'
import * as types from '../types'

interface ProgramFormData {
  name: string
  notes: string
  exercises: {
    exercise_id: number
    notes: string
    sets: { set_number: number; target_reps: number; target_weight: number }[]
  }[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  programId: number
}

export default function EditProgramModal({ isOpen, onClose, onSuccess, programId }: Props) {
  const [pickerExercises, setPickerExercises] = useState<Record<number, types.Exercise>>({})
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', exercises: [] })

  useEffect(() => {
    if (!isOpen) return
    setInitialLoading(true)
    programAPI.get(programId)
      .then(p => {
        const map: Record<number, types.Exercise> = {}
        ;(p.exercises || []).forEach(ex => { map[ex.exercise_id] = ex.exercise })
        setPickerExercises(map)
        setFormData({
          name: p.name,
          notes: p.notes || '',
          exercises: (p.exercises || []).map(ex => ({
            exercise_id: ex.exercise_id,
            notes: ex.notes || '',
            sets: (ex.sets || []).map(s => ({
              set_number: s.set_number,
              target_reps: s.target_reps,
              target_weight: s.target_weight,
            })),
          })),
        })
      })
      .catch(() => setError('Failed to load program'))
      .finally(() => setInitialLoading(false))
  }, [isOpen, programId])

  const addExercise = (exercise: types.Exercise) => {
    setPickerExercises(prev => ({ ...prev, [exercise.id]: exercise }))
    setFormData(prev => ({
      ...prev,
      exercises: [...prev.exercises, { exercise_id: exercise.id, notes: '', sets: [{ set_number: 1, target_reps: 0, target_weight: 0 }] }],
    }))
    setShowPicker(false)
    setError('')
  }

  const removeExercise = (index: number) => {
    setFormData(prev => ({ ...prev, exercises: prev.exercises.filter((_, i) => i !== index) }))
  }

  const addSet = (exIdx: number) => {
    setFormData(prev => {
      const exercises = [...prev.exercises]
      exercises[exIdx].sets.push({ set_number: exercises[exIdx].sets.length + 1, target_reps: 0, target_weight: 0 })
      return { ...prev, exercises }
    })
  }

  const removeSet = (exIdx: number, setIdx: number) => {
    setFormData(prev => {
      const exercises = [...prev.exercises]
      exercises[exIdx].sets = exercises[exIdx].sets.filter((_, i) => i !== setIdx)
      return { ...prev, exercises }
    })
  }

  const updateSet = (exIdx: number, setIdx: number, field: string, value: any) => {
    setFormData(prev => {
      const exercises = [...prev.exercises]
      ;(exercises[exIdx].sets[setIdx] as any)[field] = Number(value) || 0
      return { ...prev, exercises }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError('Program name required'); return }
    if (formData.exercises.length === 0) { setError('Add at least one exercise'); return }

    setLoading(true)
    try {
      await programAPI.update(programId, formData)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update program')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  if (initialLoading) {
    return createPortal(
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-h-[90vh] sm:max-w-2xl overflow-y-auto">
          <div className="sticky top-0 border-b border-surface-border bg-surface-base px-5 py-4 flex items-center justify-between">
            <h2 className="font-display font-bold text-xl text-tx-primary">Edit Program</h2>
            <button onClick={onClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
              <X className="w-5 h-5 text-tx-muted" />
            </button>
          </div>
          <div className="p-5 flex items-center justify-center h-32">
            <BookOpen className="w-6 h-6 text-brand-500 animate-pulse" />
          </div>
        </div>
      </div>
    , document.body)
  }

  const selectedIds = formData.exercises.map(e => e.exercise_id)
  const totalSets = formData.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-h-[90vh] sm:max-w-2xl overflow-y-auto">
        <div className="sticky top-0 border-b border-surface-border bg-surface-base px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-xl text-tx-primary">Edit Program</h2>
            <p className="text-xs text-tx-muted mt-1">{formData.exercises.length} exercises • {totalSets} sets</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-tx-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-brand-500" />
              <label className="label">Program Name</label>
            </div>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input mt-1"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-brand-500" />
              <label className="label">Notes</label>
            </div>
            <textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="input mt-1 min-h-16 resize-none"
            />
          </div>

          {formData.exercises.length > 0 && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
              <div className="text-center">
                <Zap className="w-3.5 h-3.5 text-brand-500 mx-auto mb-1" />
                <div className="text-sm font-bold text-brand-500">{formData.exercises.length}</div>
                <div className="text-xs text-tx-muted">Exercises</div>
              </div>
              <div className="text-center">
                <Target className="w-3.5 h-3.5 text-brand-500 mx-auto mb-1" />
                <div className="text-sm font-bold text-brand-500">{totalSets}</div>
                <div className="text-xs text-tx-muted">Target Sets</div>
              </div>
            </div>
          )}

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
              <ExercisePicker selectedIds={selectedIds} onSelect={addExercise} onClose={() => setShowPicker(false)} />
            )}

            <div className="space-y-4">
              {formData.exercises.map((workoutEx, exIdx) => {
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
                        onChange={e => {
                          const exercises = [...formData.exercises]
                          exercises[exIdx].notes = e.target.value
                          setFormData(prev => ({ ...prev, exercises }))
                        }}
                        className="input text-sm"
                      />
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
                            <div className="relative">
                              <input type="number" inputMode="decimal" value={set.target_weight || ''} onChange={e => updateSet(exIdx, setIdx, 'target_weight', e.target.value)} placeholder="135" className="input text-sm w-full pr-7" min="0" step="0.5" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-tx-muted font-medium pointer-events-none">lbs</span>
                            </div>
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
          </div>

          <div className="flex gap-3 sticky bottom-0 bg-surface-base pt-4 border-t border-surface-border -mx-5 px-5 pb-5">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <BookOpen className="w-4 h-4" />
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  , document.body)
}
