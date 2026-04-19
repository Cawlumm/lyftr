import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, BookOpen, ChevronRight, Dumbbell, AlertCircle, Play, Timer, Trash2 } from 'lucide-react'
import { programAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import * as types from '../types'

export default function StartWorkout() {
  const navigate = useNavigate()
  const { session, startSession, cancelSession } = useWorkoutSession()
  const [programs, setPrograms] = useState<types.Program[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    programAPI.list()
      .then(data => setPrograms(data || []))
      .catch(() => setError('Failed to load programs'))
      .finally(() => setLoading(false))
  }, [])

  const startQuick = () => {
    const name = `Workout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    startSession(name, [])
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
    navigate('/workout/active')
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <h1 className="font-display font-bold text-2xl text-tx-primary">Start Workout</h1>
      </div>

      {/* Active session — resume or discard */}
      {session && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Timer className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-tx-primary">{session.name}</p>
              <p className="text-xs text-amber-400/80">Workout in progress</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/workout/active')}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> Resume
            </button>
            <button
              onClick={() => cancelSession()}
              className="flex-1 py-2.5 bg-surface-muted hover:bg-error-500/10 text-tx-secondary hover:text-error-400 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 border border-surface-border"
            >
              <Trash2 className="w-4 h-4" /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Quick start */}
      <button
        onClick={startQuick}
        className="w-full flex items-center gap-4 p-5 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/15 rounded-2xl transition-colors group"
      >
        <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div className="text-left flex-1">
          <p className="font-semibold text-tx-primary text-lg">Quick Start</p>
          <p className="text-sm text-tx-muted mt-0.5">Start blank, add exercises as you go</p>
        </div>
        <ChevronRight className="w-5 h-5 text-tx-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Programs section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-brand-500" />
          <h2 className="font-semibold text-tx-primary">Start from Program</h2>
        </div>

        {error && (
          <div className="alert-error mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-tx-muted text-sm">
            <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
            Loading programs…
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-10 card">
            <BookOpen className="w-8 h-8 text-tx-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm text-tx-muted">No programs yet</p>
            <button
              onClick={() => navigate('/programs/new')}
              className="mt-3 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              Create your first program →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {programs.map(p => (
              <button
                key={p.id}
                onClick={() => startFromProgram(p)}
                className="w-full flex items-center gap-3 p-4 card hover:bg-surface-muted transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-tx-primary truncate">{p.name}</p>
                  <p className="text-xs text-tx-muted mt-0.5">
                    {p.exercises?.length || 0} exercises
                  </p>
                </div>
                <Play className="w-4 h-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
