import { useState, useEffect } from 'react'
import { X, BookOpen, ChevronRight, Dumbbell, AlertCircle, Moon } from 'lucide-react'
import { programAPI } from '../services/api'
import { workoutDays, dayLabel, todaysDay } from '../utils/programUtils'
import * as types from '../types'

interface Props {
  onSelect: (program: types.Program, day: types.ProgramDay) => void
  onClose: () => void
}

// Two-step: pick a Program, then (if it has more than one workout day) pick which
// Day to load — a single-workout-day program skips straight through, so the common
// case stays a one-tap flow exactly like before the multi-day rework.
export default function ProgramPicker({ onSelect, onClose }: Props) {
  const [programs, setPrograms] = useState<types.Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dayPickFor, setDayPickFor] = useState<types.Program | null>(null)

  useEffect(() => {
    programAPI.list()
      .then(data => setPrograms(data || []))
      .catch(() => setError('Failed to load programs'))
      .finally(() => setLoading(false))
  }, [])

  const pickProgram = (p: types.Program) => {
    const days = workoutDays(p)
    if (days.length === 0) return // nothing to load — no exercises anywhere in this program
    if (days.length === 1) { onSelect(p, days[0]); return }
    setDayPickFor(p)
  }

  const title = dayPickFor ? dayPickFor.name : 'Load from Program'
  const subtitle = dayPickFor ? 'Pick a day to pre-fill exercises' : 'Pick a program to pre-fill exercises'

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full sm:max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-tx-primary">{title}</h3>
            <p className="text-xs text-tx-muted mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-tx-muted" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-tx-muted text-sm">
              <BookOpen className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
              Loading programs…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 text-error-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          ) : dayPickFor ? (
            <div>
              <button
                type="button"
                onClick={() => setDayPickFor(null)}
                className="w-full text-left px-4 py-2 text-xs text-tx-muted hover:text-tx-secondary transition-colors"
              >
                ← Back to programs
              </button>
              <div className="divide-y divide-surface-border">
                {workoutDays(dayPickFor).map((day, i) => {
                  const isToday = todaysDay(dayPickFor)?.id === day.id
                  return (
                    <button
                      key={day.id ?? i}
                      type="button"
                      onClick={() => onSelect(dayPickFor, day)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors text-left group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Dumbbell className="w-4 h-4 text-brand-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary truncate flex items-center gap-1.5">
                          {dayLabel(day, day.order_index)}
                          {isToday && <span className="text-[10px] font-bold text-brand-400 bg-brand-500/15 px-1.5 py-0.5 rounded-full">TODAY</span>}
                        </p>
                        <span className="text-xs text-tx-muted">
                          {(day.exercises ?? []).length} exercise{(day.exercises ?? []).length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <BookOpen className="w-8 h-8 text-tx-muted mb-2 opacity-50" />
              <p className="text-sm text-tx-muted">No programs yet</p>
              <p className="text-xs text-tx-muted mt-1">Create a program first</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {programs.map(p => {
                const days = workoutDays(p)
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={days.length === 0}
                    onClick={() => pickProgram(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-left group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-4 h-4 text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-tx-primary truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-tx-muted">
                          <Dumbbell className="w-3 h-3 inline mr-1" />
                          {days.length === 0 ? 'No exercises yet' : `${days.length} workout day${days.length === 1 ? '' : 's'}`}
                        </span>
                        {(p.days ?? []).some(d => d.is_rest_day) && (
                          <span className="text-xs text-tx-muted"><Moon className="w-3 h-3 inline mr-0.5" />rest days</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
