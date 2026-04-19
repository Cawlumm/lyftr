import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, BookOpen, Zap, ChevronRight, Dumbbell, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { programAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import * as types from '../types'

type Mode = 'pick' | 'from-program'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function StartWorkoutModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const { startSession } = useWorkoutSession()
  const [mode, setMode] = useState<Mode>('pick')
  const [programs, setPrograms] = useState<types.Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programsError, setProgramsError] = useState('')

  useEffect(() => {
    if (!isOpen) setMode('pick')
  }, [isOpen])

  useEffect(() => {
    if (mode === 'from-program' && programs.length === 0) {
      setProgramsLoading(true)
      programAPI.list()
        .then(data => setPrograms(data || []))
        .catch(() => setProgramsError('Failed to load programs'))
        .finally(() => setProgramsLoading(false))
    }
  }, [mode])

  const startQuick = () => {
    const name = `Workout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    startSession(name, [])
    onClose()
    navigate('/workout/active')
  }

  const startFromProgram = (program: types.Program) => {
    const exercises: types.ActiveSessionExercise[] = (program.exercises || []).map(ex => ({
      exercise_id: ex.exercise_id,
      exercise: ex.exercise,
      notes: ex.notes || '',
      sets: (ex.sets || []).map(s => ({
        set_number: s.set_number,
        target_reps: s.target_reps,
        target_weight: s.target_weight,
        actual_reps: s.target_reps,
        actual_weight: s.target_weight,
        completed: false,
      })),
    }))
    startSession(program.name, exercises, program.id)
    onClose()
    navigate('/workout/active')
  }

  if (!isOpen) return null

  return createPortal((
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-display font-bold text-xl text-tx-primary">Start Workout</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-tx-muted" />
          </button>
        </div>

        <div className="p-5">
          {mode === 'pick' && (
            <div className="space-y-3">
              <button
                onClick={startQuick}
                className="w-full flex items-center gap-4 p-4 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/15 rounded-xl transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-tx-primary">Quick Start</p>
                  <p className="text-xs text-tx-muted mt-0.5">Start blank, add exercises as you go</p>
                  <p className="text-xs text-brand-400 mt-0.5 font-medium">Goes straight to session →</p>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => setMode('from-program')}
                className="w-full flex items-center gap-4 p-4 bg-surface-muted/50 border border-surface-border hover:bg-surface-muted rounded-xl transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-brand-500" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-tx-primary">From Program</p>
                  <p className="text-xs text-tx-muted mt-0.5">Load a saved program template</p>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          )}

          {mode === 'from-program' && (
            <div className="space-y-3">
              <button onClick={() => setMode('pick')} className="text-xs text-tx-muted hover:text-tx-secondary transition-colors">← Back</button>
              {programsLoading ? (
                <div className="flex items-center justify-center py-8 text-tx-muted text-sm">
                  <BookOpen className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
                  Loading programs…
                </div>
              ) : programsError ? (
                <div className="flex items-center gap-2 text-error-400 text-sm py-4">
                  <AlertCircle className="w-4 h-4" />
                  {programsError}
                </div>
              ) : programs.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="w-8 h-8 text-tx-muted mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-tx-muted">No programs yet</p>
                  <p className="text-xs text-tx-muted mt-1">Create a program first</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {programs.map(p => (
                    <button
                      key={p.id}
                      onClick={() => startFromProgram(p)}
                      className="w-full flex items-center gap-3 p-3 bg-surface-muted/50 border border-surface-border hover:bg-surface-muted rounded-xl transition-colors text-left group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-brand-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-tx-primary truncate">{p.name}</p>
                        <p className="text-xs text-tx-muted">
                          <Dumbbell className="w-3 h-3 inline mr-1" />
                          {p.exercises?.length || 0} exercises
                        </p>
                      </div>
                      <Play className="w-4 h-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}
