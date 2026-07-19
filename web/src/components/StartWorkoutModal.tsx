import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, BookOpen, Zap, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutSession } from '../stores/workoutSession'
import ProgramPicker from './ProgramPicker'
import { activeSessionExercisesForDay, dayLabel } from '../utils/programUtils'
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

  useEffect(() => {
    if (!isOpen) setMode('pick')
  }, [isOpen])

  const startQuick = () => {
    const name = `Workout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    startSession(name, [])
    onClose()
    navigate('/workout/active')
  }

  const startFromProgram = (program: types.Program, day: types.ProgramDay) => {
    const exercises = activeSessionExercisesForDay(day)
    const dayCount = program.days?.length ?? 0
    const name = dayCount > 1 ? `${program.name} — ${dayLabel(day, day.order_index)}` : program.name
    startSession(name, exercises, program.id, day.id)
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
                  <p className="text-xs text-tx-muted mt-0.5">Load a saved program's day</p>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          )}
        </div>

        {mode === 'from-program' && (
          <ProgramPicker onSelect={startFromProgram} onClose={() => setMode('pick')} />
        )}
      </div>
    </div>
  ), document.body)
}
