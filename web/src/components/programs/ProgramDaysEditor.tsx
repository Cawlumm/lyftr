import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Dumbbell, Moon, ChevronRight, ChevronLeft as ChevronCollapse } from 'lucide-react'
import DayExercisesEditor from './DayExercisesEditor'
import * as types from '../../types'
import type { DayDraft } from './types'

interface Props {
  days: DayDraft[]
  onChange: (days: DayDraft[]) => void
  pickerExercises: Record<number, types.Exercise>
  onCacheExercise: (ex: types.Exercise) => void
  wUnit: string
  restSecondsDefault: number
}

const reindex = (days: DayDraft[]): DayDraft[] => days.map((d, i) => ({ ...d, order_index: i }))

// The program's day/rest-day cycle, in order. Add/remove/reorder days here; each
// workout day expands to the (unchanged) per-day exercise editor.
export default function ProgramDaysEditor({ days, onChange, pickerExercises, onCacheExercise, wUnit, restSecondsDefault }: Props) {
  const [expanded, setExpanded] = useState<number | null>(days.findIndex(d => !d.is_rest_day))

  const addDay = (isRest: boolean) => {
    const next = reindex([...days, { order_index: days.length, is_rest_day: isRest, name: '', exercises: [] }])
    onChange(next)
    setExpanded(next.length - 1)
  }

  const removeDay = (idx: number) => {
    onChange(reindex(days.filter((_, i) => i !== idx)))
    setExpanded(null)
  }

  const moveDay = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= days.length) return
    const next = [...days]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(reindex(next))
    if (expanded === idx) setExpanded(target)
    else if (expanded === target) setExpanded(idx)
  }

  const updateDay = (idx: number, patch: Partial<DayDraft>) => {
    const next = [...days]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  const toggleRest = (idx: number) => {
    const day = days[idx]
    // Switching to rest clears its exercises — a rest day never carries any.
    updateDay(idx, { is_rest_day: !day.is_rest_day, exercises: day.is_rest_day ? day.exercises : [] })
  }

  return (
    <div className="space-y-3">
      {days.length === 0 && (
        <p className="text-xs text-tx-muted text-center py-4">No days yet — add a workout or rest day below.</p>
      )}

      {days.map((day, idx) => {
        const isOpen = expanded === idx
        return (
          <div key={idx} className={`border rounded-lg overflow-hidden ${day.is_rest_day ? 'border-surface-border bg-surface-muted/20' : 'border-surface-border bg-surface-muted/30'}`}>
            <div className="flex items-center gap-2 p-3">
              <div className="flex flex-col flex-shrink-0">
                <button type="button" onClick={() => moveDay(idx, -1)} disabled={idx === 0} className="p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-20 transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveDay(idx, 1)} disabled={idx === days.length - 1} className="p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-20 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${day.is_rest_day ? 'bg-surface-muted' : 'bg-brand-500/15'}`}>
                {day.is_rest_day ? <Moon className="w-4 h-4 text-tx-muted" /> : <Dumbbell className="w-4 h-4 text-brand-500" />}
              </div>

              <input
                type="text"
                value={day.name}
                onChange={e => updateDay(idx, { name: e.target.value })}
                placeholder={day.is_rest_day ? `Rest Day ${idx + 1}` : `Day ${idx + 1}`}
                className="input text-sm flex-1 min-w-0"
              />

              <div className="flex items-center rounded-lg border border-surface-border overflow-hidden flex-shrink-0">
                <button
                  type="button"
                  onClick={() => day.is_rest_day && toggleRest(idx)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${!day.is_rest_day ? 'bg-brand-500 text-white' : 'bg-transparent text-tx-muted hover:text-tx-secondary'}`}
                >
                  Workout
                </button>
                <button
                  type="button"
                  onClick={() => !day.is_rest_day && toggleRest(idx)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${day.is_rest_day ? 'bg-surface-muted text-tx-primary' : 'bg-transparent text-tx-muted hover:text-tx-secondary'}`}
                >
                  Rest
                </button>
              </div>

              {!day.is_rest_day && (
                <button type="button" onClick={() => setExpanded(isOpen ? null : idx)} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors flex-shrink-0">
                  {isOpen ? <ChevronCollapse className="w-4 h-4 text-tx-muted rotate-90" /> : <ChevronRight className="w-4 h-4 text-tx-muted" />}
                </button>
              )}

              <button type="button" onClick={() => removeDay(idx)} className="p-1.5 hover:bg-error-500/20 rounded transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4 text-error-400" />
              </button>
            </div>

            {!day.is_rest_day && (
              <div className="px-3 pb-3 flex items-center gap-2 -mt-1">
                <span className="text-[11px] text-tx-muted">{day.exercises.length} exercise{day.exercises.length === 1 ? '' : 's'}</span>
              </div>
            )}

            {!day.is_rest_day && isOpen && (
              <div className="px-3 pb-4 pt-1 border-t border-surface-border/60">
                <DayExercisesEditor
                  exercises={day.exercises}
                  onChange={exercises => updateDay(idx, { exercises })}
                  pickerExercises={pickerExercises}
                  onCacheExercise={onCacheExercise}
                  wUnit={wUnit}
                  restSecondsDefault={restSecondsDefault}
                />
              </div>
            )}
          </div>
        )
      })}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addDay(false)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs bg-brand-500/10 hover:bg-brand-500/15 text-brand-400 border border-brand-500/20 rounded-lg transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Workout Day
        </button>
        <button
          type="button"
          onClick={() => addDay(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary border border-surface-border rounded-lg transition-colors font-medium"
        >
          <Moon className="w-3.5 h-3.5" />
          Add Rest Day
        </button>
      </div>
    </div>
  )
}
