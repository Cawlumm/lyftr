import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { BookOpen, Plus, ChevronDown, Dumbbell, Target, Edit2, Trash2, AlertCircle, Search, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import AddProgramModal from '../components/AddProgramModal'
import EditProgramModal from '../components/EditProgramModal'
import { programAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
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

function ProgramCard({
  program,
  onEdit,
  onDelete,
}: {
  program: types.Program
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}) {
  const navigate = useNavigate()
  const { session, startSession } = useWorkoutSession()
  const [open, setOpen] = useState(false)

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (session) { navigate('/workout/active'); return }
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
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await programAPI.delete(program.id)
      onDelete(program.id)
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="card overflow-hidden border-error-500/30">
        <div className="flex items-center justify-between p-4 bg-error-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-error-500/10 border border-error-500/20 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-error-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-tx-primary">Delete "{program.name}"?</p>
              <p className="text-xs text-tx-muted">This cannot be undone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalSets = program.exercises?.reduce((s, e) => s + (e.sets?.length || 0), 0) || 0

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between p-4 hover:bg-surface-muted transition-colors group">
        <button className="flex-1 flex items-center gap-3 min-w-0" onClick={() => setOpen(o => !o)}>
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-brand-500" strokeWidth={2} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-tx-primary">{program.name}</p>
            <p className="text-xs text-tx-muted">{format(new Date(program.created_at), 'MMM d, yyyy')}</p>
          </div>
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-tx-muted">
            <span className="flex items-center gap-1">
              <Dumbbell className="w-3.5 h-3.5" /> {program.exercises?.length || 0} exercises
            </span>
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> {totalSets} sets
            </span>
          </div>
          <button
            onClick={handleStart}
            className="p-2 bg-brand-500/10 hover:bg-brand-500/20 rounded-lg transition-colors border border-brand-500/20"
            title="Start workout from this program"
          >
            <Play className="w-4 h-4 text-brand-500" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(program.id) }}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <Edit2 className="w-4 h-4 text-brand-500" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true) }}
            className="p-2 hover:bg-error-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-4 h-4 text-error-400" />
          </button>
          <ChevronDown className={`w-4 h-4 text-tx-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="border-t border-surface-border animate-slide-up">
          {program.notes && (
            <p className="px-4 py-2.5 text-xs text-tx-muted border-b border-surface-border">{program.notes}</p>
          )}

          <div className="p-3 space-y-2">
            {program.exercises?.map((ex) => {
              const maxTarget = ex.sets?.length > 0 ? Math.max(...ex.sets.map(s => s.target_weight || 0)) : 0
              return (
                <div key={ex.id} className="bg-surface-muted/30 border border-surface-border rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Dumbbell className="w-3.5 h-3.5 text-brand-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-tx-primary leading-tight">{ex.exercise.name}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-1 ${muscleColor(ex.exercise.muscle_group)}`}>
                          {ex.exercise.muscle_group}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs text-tx-muted">Target</p>
                      <p className="text-sm font-bold text-brand-400 tabular-nums">{maxTarget > 0 ? `${maxTarget} lbs` : '—'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ex.sets?.map((set, i) => (
                      <div key={i} className="flex items-center gap-1 bg-surface-raised px-2 py-1 rounded-lg border border-surface-border">
                        <span className="text-xs text-tx-muted font-medium">#{set.set_number}</span>
                        <span className="text-xs font-semibold text-tx-primary tabular-nums">
                          {set.target_reps > 0 ? set.target_reps : '—'} × {set.target_weight > 0 ? `${set.target_weight}` : '0'}<span className="text-tx-muted font-normal">lb</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Programs() {
  const [programs, setPrograms] = useState<types.Program[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const loadPrograms = async () => {
    try {
      const data = await programAPI.list()
      setPrograms(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load programs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPrograms() }, [])

  const filtered = programs.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <Loading />

  if (error) {
    return (
      <div className="alert-error">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Programs</h1>
          <p className="text-tx-muted text-sm mt-0.5">Reusable workout templates</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary btn-md">
          <Plus className="w-4 h-4" /> New Program
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total', value: programs.length.toString(), unit: 'programs', icon: BookOpen },
          { label: 'Avg Exercises', value: programs.length > 0 ? Math.round(programs.reduce((s, p) => s + (p.exercises?.length || 0), 0) / programs.length).toString() : '0', unit: 'per program', icon: Dumbbell },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label">{s.label}</span>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="stat-value text-xl">{s.value}</span>
              <span className="text-xs text-tx-muted mb-0.5">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-10"
          placeholder="Search programs…"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-tx-muted" />
            </div>
            <p className="text-sm font-medium text-tx-primary mb-1">No programs found</p>
            <p className="text-xs text-tx-muted">{search ? 'Try a different search' : 'Create a program to get started'}</p>
          </div>
        ) : (
          filtered.map(p => (
            <ProgramCard
              key={p.id}
              program={p}
              onEdit={(id) => { setEditingId(id); setShowEditModal(true) }}
              onDelete={(id) => setPrograms(prev => prev.filter(x => x.id !== id))}
            />
          ))
        )}
      </div>

      <AddProgramModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={loadPrograms} />
      <EditProgramModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingId(null) }}
        onSuccess={loadPrograms}
        programId={editingId || 0}
      />
    </div>
  )
}
