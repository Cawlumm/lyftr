import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, BookOpen, ChevronRight, Play, Timer, Trash2 } from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import ProgramPicker from '../components/ProgramPicker'
import { activeSessionExercisesForDay, dayLabel } from '../utils/programUtils'
import * as types from '../types'

export default function StartWorkout() {
  const navigate = useNavigate()
  const { session, startSession, cancelSession } = useWorkoutSession()
  const [showProgramPicker, setShowProgramPicker] = useState(false)

  const startQuick = () => {
    const name = `Workout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    startSession(name, [])
    navigate('/workout/active')
  }

  const startFromProgram = (program: types.Program, day: types.ProgramDay) => {
    const exercises = activeSessionExercisesForDay(day)
    const dayCount = program.days?.length ?? 0
    const name = dayCount > 1 ? `${program.name} — ${dayLabel(day, day.order_index)}` : program.name
    startSession(name, exercises, program.id, day.id)
    setShowProgramPicker(false)
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
      <button
        onClick={() => setShowProgramPicker(true)}
        className="w-full flex items-center gap-4 p-5 bg-surface-muted/50 border border-surface-border hover:bg-surface-muted rounded-2xl transition-colors group"
      >
        <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-6 h-6 text-brand-500" />
        </div>
        <div className="text-left flex-1">
          <p className="font-semibold text-tx-primary text-lg">Start from Program</p>
          <p className="text-sm text-tx-muted mt-0.5">Load a saved routine's day</p>
        </div>
        <ChevronRight className="w-5 h-5 text-tx-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {showProgramPicker && (
        <ProgramPicker onSelect={startFromProgram} onClose={() => setShowProgramPicker(false)} />
      )}
    </div>
  )
}
