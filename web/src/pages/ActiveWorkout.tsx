import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timer, CheckCircle2, Circle, Plus, Trash2, X, Dumbbell, Flag, AlertCircle } from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import { workoutAPI } from '../services/api'
import ExercisePicker from '../components/ExercisePicker'
import * as types from '../types'

const MUSCLE_COLORS: Record<string, string> = {
  chest: 'bg-red-500/15 text-red-400',
  back: 'bg-blue-500/15 text-blue-400',
  shoulders: 'bg-orange-500/15 text-orange-400',
  biceps: 'bg-purple-500/15 text-purple-400',
  triceps: 'bg-pink-500/15 text-pink-400',
  quadriceps: 'bg-green-500/15 text-green-400',
  hamstrings: 'bg-teal-500/15 text-teal-400',
  glutes: 'bg-yellow-500/15 text-yellow-400',
  calves: 'bg-lime-500/15 text-lime-400',
  abdominals: 'bg-amber-500/15 text-amber-400',
  forearms: 'bg-cyan-500/15 text-cyan-400',
  traps: 'bg-indigo-500/15 text-indigo-400',
  lats: 'bg-sky-500/15 text-sky-400',
}
function muscleColor(m: string) {
  return MUSCLE_COLORS[m?.toLowerCase()] || 'bg-surface-muted text-tx-muted'
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const { session, updateSet, completeSet, addSet, addExercise, removeExercise, buildPayload, cancelSession } = useWorkoutSession()
  const [elapsed, setElapsed] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session) return
    const started = new Date(session.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session])

  if (!session) {
    return (
      <div className="empty-state py-20">
        <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
          <Dumbbell className="w-6 h-6 text-tx-muted" />
        </div>
        <p className="text-sm font-medium text-tx-primary mb-1">No active workout</p>
        <p className="text-xs text-tx-muted mb-4">Start one from the home page</p>
        <button onClick={() => navigate('/')} className="btn-primary btn-sm">Go Home</button>
      </div>
    )
  }

  const handleAddExercise = (exercise: types.Exercise) => {
    const newEx: types.ActiveSessionExercise = {
      exercise_id: exercise.id,
      exercise,
      notes: '',
      sets: [{
        set_number: 1,
        target_reps: 0,
        target_weight: 0,
        actual_reps: 0,
        actual_weight: 0,
        completed: false,
      }],
    }
    addExercise(newEx)
    setShowPicker(false)
  }

  const handleFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const payload = buildPayload()
      await workoutAPI.create(payload)
      cancelSession()
      navigate('/workouts')
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Failed to save workout')
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  const selectedIds = session.exercises.map(e => e.exercise_id)
  const completedSets = session.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0)
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-tx-primary">{session.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-sm font-mono text-brand-400">
                <Timer className="w-3.5 h-3.5" />
                {formatElapsed(elapsed)}
              </span>
              <span className="text-xs text-tx-muted">
                {completedSets}/{totalSets} sets done
              </span>
            </div>
          </div>
          <button
            onClick={() => setConfirmFinish(true)}
            disabled={finishing}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            <Flag className="w-4 h-4" />
            Finish
          </button>
      </div>

      <div>
        {saveError && (
          <div className="alert-error mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <div className="space-y-4">
          {session.exercises.length === 0 ? (
            <div className="empty-state py-16">
              <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
                <Dumbbell className="w-6 h-6 text-tx-muted" />
              </div>
              <p className="text-sm font-medium text-tx-primary mb-1">No exercises yet</p>
              <p className="text-xs text-tx-muted">Add exercises below to get started</p>
            </div>
          ) : (
            session.exercises.map((ex, exIdx) => (
              <div key={exIdx} className="card overflow-hidden">
                {/* Exercise header */}
                <div className="flex items-center justify-between p-4 border-b border-surface-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                      <Dumbbell className="w-4 h-4 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-tx-primary truncate">{ex.exercise.name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-0.5 ${muscleColor(ex.exercise.muscle_group)}`}>
                        {ex.exercise.muscle_group}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="p-2 hover:bg-error-500/10 rounded-lg transition-colors flex-shrink-0 ml-2"
                  >
                    <X className="w-4 h-4 text-error-400" />
                  </button>
                </div>

                {/* Sets */}
                <div className="p-3 space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 px-1">
                    <span className="text-xs text-tx-muted font-medium text-center">Set</span>
                    <span className="text-xs text-tx-muted font-medium text-center">Reps</span>
                    <span className="text-xs text-tx-muted font-medium text-center">Weight</span>
                    <span />
                  </div>

                  {ex.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className={`grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center p-2 rounded-lg border transition-colors ${
                        set.completed
                          ? 'bg-brand-500/5 border-brand-500/20'
                          : 'bg-surface-muted/20 border-surface-border/50'
                      }`}
                    >
                      <span className="text-xs font-bold text-tx-muted text-center">{set.set_number}</span>

                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actual_reps || ''}
                        onChange={e => updateSet(exIdx, setIdx, 'actual_reps', Number(e.target.value) || 0)}
                        placeholder={set.target_reps > 0 ? String(set.target_reps) : '0'}
                        className={`input text-sm text-center px-2 py-1.5 ${set.completed ? 'opacity-60' : ''}`}
                        disabled={set.completed}
                      />

                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={set.actual_weight || ''}
                          onChange={e => updateSet(exIdx, setIdx, 'actual_weight', Number(e.target.value) || 0)}
                          placeholder={set.target_weight > 0 ? String(set.target_weight) : '0'}
                          className={`input text-sm text-center px-2 py-1.5 w-full pr-6 ${set.completed ? 'opacity-60' : ''}`}
                          disabled={set.completed}
                          step="0.5"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none">lb</span>
                      </div>

                      <button
                        onClick={() => completeSet(exIdx, setIdx)}
                        className="flex items-center justify-center"
                      >
                        {set.completed
                          ? <CheckCircle2 className="w-5 h-5 text-brand-500" />
                          : <Circle className="w-5 h-5 text-tx-muted hover:text-brand-400 transition-colors" />
                        }
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(exIdx)}
                    className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors mt-1 pl-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Set
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add exercise + cancel */}
        <div className="mt-4 space-y-2 pb-4">
          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-3 border border-dashed border-surface-border hover:border-brand-500/50 rounded-xl text-sm text-tx-muted hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>

          <button
            onClick={() => setConfirmCancel(true)}
            className="w-full py-2.5 text-xs text-tx-muted hover:text-error-400 transition-colors"
          >
            Cancel Workout
          </button>
        </div>
      </div>

      {/* ExercisePicker */}
      {showPicker && (
        <ExercisePicker
          selectedIds={selectedIds}
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Finish confirm */}
      {confirmFinish && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Finish Workout?</h3>
            <p className="text-sm text-tx-muted mb-4">
              {completedSets} of {totalSets} sets completed. Workout will be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinish(false)}
                className="flex-1 py-2.5 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Cancel Workout?</h3>
            <p className="text-sm text-tx-muted mb-4">All progress will be lost. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-2.5 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={() => { cancelSession(); navigate('/') }}
                className="flex-1 py-2.5 bg-error-500 hover:bg-error-600 text-white rounded-lg transition-colors font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
