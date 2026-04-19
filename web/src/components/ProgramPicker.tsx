import { useState, useEffect } from 'react'
import { X, BookOpen, ChevronRight, Dumbbell, AlertCircle } from 'lucide-react'
import { programAPI } from '../services/api'
import * as types from '../types'

interface Props {
  onSelect: (program: types.Program) => void
  onClose: () => void
}

export default function ProgramPicker({ onSelect, onClose }: Props) {
  const [programs, setPrograms] = useState<types.Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    programAPI.list()
      .then(data => setPrograms(data || []))
      .catch(() => setError('Failed to load programs'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-base border border-surface-border rounded-2xl w-full sm:max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-tx-primary">Load from Program</h3>
            <p className="text-xs text-tx-muted mt-0.5">Pick a program to pre-fill exercises</p>
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
          ) : programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <BookOpen className="w-8 h-8 text-tx-muted mb-2 opacity-50" />
              <p className="text-sm text-tx-muted">No programs yet</p>
              <p className="text-xs text-tx-muted mt-1">Create a program first</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {programs.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-brand-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tx-primary truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-tx-muted">
                        <Dumbbell className="w-3 h-3 inline mr-1" />
                        {p.exercises?.length || 0} exercises
                      </span>
                      {p.notes && (
                        <span className="text-xs text-tx-muted truncate">• {p.notes}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
