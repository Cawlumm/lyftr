import { X, Dumbbell, Coffee, ChevronRight } from 'lucide-react'
import * as types from '../types'

interface Props {
  program: types.Program
  onPick: (day: types.ProgramDay) => void
  onClose: () => void
}

// DayPicker lets the user choose which day of a multi-day program to run. Rest days are
// shown for context but greyed and non-selectable. Single-training-day programs never
// reach this modal (callers start them directly).
export default function DayPicker({ program, onPick, onClose }: Props) {
  const days = program.days || []
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full sm:max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-tx-primary">Pick a day</h3>
            <p className="text-xs text-tx-muted mt-0.5">{program.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-tx-muted" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-surface-border">
          {days.map((day, i) => day.is_rest_day ? (
            <div key={day.id ?? i} className="flex items-center gap-3 px-4 py-3 opacity-50">
              <div className="w-9 h-9 rounded-lg bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
                <Coffee className="w-4 h-4 text-tx-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-tx-secondary truncate">{day.name}</p>
                <p className="text-xs text-tx-muted">Rest day</p>
              </div>
            </div>
          ) : (
            <button
              key={day.id ?? i}
              type="button"
              onClick={() => onPick(day)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="w-4 h-4 text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-tx-primary truncate">{day.name}</p>
                <p className="text-xs text-tx-muted">{day.exercises?.length || 0} exercises</p>
              </div>
              <ChevronRight className="w-4 h-4 text-tx-muted group-hover:text-brand-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
