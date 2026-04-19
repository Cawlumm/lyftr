import { useState, useEffect } from 'react'
import { X, Search, Dumbbell, ChevronRight } from 'lucide-react'
import { exerciseAPI } from '../services/api'
import * as types from '../types'

const MUSCLE_COLORS: Record<string, string> = {
  chest: 'bg-red-500/20 text-red-400 border-red-500/30',
  back: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shoulders: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  biceps: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  triceps: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  legs: 'bg-green-500/20 text-green-400 border-green-500/30',
  quadriceps: 'bg-green-500/20 text-green-400 border-green-500/30',
  hamstrings: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  glutes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  calves: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  abdominals: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  core: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  forearms: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  traps: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  lats: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
}

const EQUIPMENT_LABEL: Record<string, string> = {
  'body only': 'Bodyweight',
  'barbell': 'Barbell',
  'dumbbell': 'Dumbbell',
  'machine': 'Machine',
  'cable': 'Cable',
  'kettlebells': 'Kettlebell',
  'bands': 'Bands',
  'medicine ball': 'Med Ball',
  'other': 'Other',
  'foam roll': 'Foam Roll',
}

function muscleColor(muscle: string) {
  const key = muscle?.toLowerCase()
  return MUSCLE_COLORS[key] || 'bg-surface-muted text-tx-muted border-surface-border'
}

interface Props {
  selectedIds: number[]
  onSelect: (exercise: types.Exercise) => void
  onClose: () => void
}

export default function ExercisePicker({ selectedIds, onSelect, onClose }: Props) {
  const [exercises, setExercises] = useState<types.Exercise[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadExercises('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => loadExercises(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const loadExercises = async (q: string) => {
    setLoading(true)
    try {
      const data = await exerciseAPI.list(q ? { q } : undefined)
      setExercises(data || [])
    } catch {}
    finally { setLoading(false) }
  }

  const available = exercises.filter(e => !selectedIds.includes(e.id))

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full sm:max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-tx-primary">Add Exercise</h3>
            <p className="text-xs text-tx-muted mt-0.5">{available.length} available</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-tx-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, muscle, equipment…"
              className="input pl-10 w-full"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading && exercises.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-tx-muted text-sm">
              <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
              Loading exercises…
            </div>
          ) : available.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-tx-muted text-sm">
              No exercises found
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {available.slice(0, 30).map(ex => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => onSelect(ex)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors text-left group"
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="w-4 h-4 text-brand-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tx-primary truncate">{ex.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${muscleColor(ex.muscle_group)}`}>
                        {ex.muscle_group}
                      </span>
                      {ex.equipment && ex.equipment !== 'other' && (
                        <span className="text-xs text-tx-muted">
                          {EQUIPMENT_LABEL[ex.equipment] || ex.equipment}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
              {available.length > 30 && (
                <div className="px-4 py-2 text-xs text-tx-muted text-center">
                  Showing 30 of {available.length} — refine search to narrow results
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
