import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { BookOpen, Plus, Dumbbell, Edit2, Trash2, Search, Play, ChevronRight, MoreVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import { useServerInfiniteList } from '../hooks/useServerInfiniteList'
import { programAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import * as types from '../types'

import { muscleColor } from '../utils/exerciseUtils'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inMenu = menuRef.current?.contains(e.target as Node)
      const inPortal = portalRef.current?.contains(e.target as Node)
      if (!inMenu && !inPortal) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (session) { navigate('/workout/start'); return }
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
    <div className="card group active:scale-[0.99] transition-transform">
      <div className="flex items-center p-4 gap-3">
        <button
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
          onClick={() => navigate(`/programs/${program.id}`)}
        >
          {program.exercises?.[0]?.exercise?.image_url ? (
            <img
              src={program.exercises[0].exercise.image_url}
              alt=""
              className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-brand-500" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tx-primary truncate">{program.name}</p>
            <p className="text-xs text-tx-muted mt-0.5 whitespace-nowrap">{format(new Date(program.created_at), 'MMM d, yyyy')}</p>
            <div className="flex items-center gap-x-2 mt-0.5 min-w-0 overflow-hidden">
              <span className="text-xs text-tx-muted whitespace-nowrap">{program.exercises?.length || 0} exercises</span>
              <span className="text-tx-muted/40 text-xs">·</span>
              <span className="text-xs text-tx-muted whitespace-nowrap">{totalSets} sets</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
        </button>

        {/* Mobile: kebab | Desktop: hover icons */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          {/* Mobile kebab trigger */}
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className={`sm:hidden p-2 rounded-lg transition-colors ${menuOpen ? 'bg-surface-muted' : 'hover:bg-surface-muted'}`}
            aria-label="Options"
          >
            <MoreVertical className="w-4 h-4 text-tx-muted" />
          </button>

          {/* Centered modal dropdown — portal to escape transform stacking context */}
          {menuOpen && createPortal(
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
              />
              <div ref={portalRef} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 bg-surface-overlay border border-surface-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 pt-4 pb-3">
                  <p className="text-[10px] font-semibold text-tx-muted uppercase tracking-wider text-center">Program</p>
                  <p className="text-sm font-semibold text-tx-primary text-center mt-0.5 truncate">{program.name}</p>
                </div>
                <div className="border-t border-surface-border/40 py-1.5">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); handleStart(e) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-tx-primary hover:bg-surface-muted/60 active:bg-surface-muted transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                      <Play className="w-4 h-4 text-brand-500" />
                    </div>
                    Start Workout
                  </button>
                  <div className="mx-4 border-t border-surface-border/30" />
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(program.id) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-tx-primary hover:bg-surface-muted/60 active:bg-surface-muted transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                      <Edit2 className="w-4 h-4 text-brand-500" />
                    </div>
                    Edit Program
                  </button>
                  <div className="mx-4 border-t border-surface-border/30" />
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); setConfirming(true) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-error-400 hover:bg-error-500/10 active:bg-error-500/15 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-error-500/10 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-error-400" />
                    </div>
                    Delete Program
                  </button>
                </div>
                <div className="border-t border-surface-border/40 p-3">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
                    className="w-full py-2.5 text-sm font-semibold text-tx-muted bg-surface-muted/60 hover:bg-surface-muted rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}

          {/* Desktop hover icons */}
          <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleStart}
              className="p-2 hover:bg-brand-500/10 rounded-lg transition-colors" title="Start workout">
              <Play className="w-4 h-4 text-brand-500" />
            </button>
            <button onClick={e => { e.stopPropagation(); onEdit(program.id) }}
              className="p-2 hover:bg-surface-muted rounded-lg transition-colors">
              <Edit2 className="w-4 h-4 text-brand-500" />
            </button>
            <button aria-label="Delete" onClick={e => { e.stopPropagation(); setConfirming(true) }}
              className="p-2 hover:bg-error-500/10 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4 text-error-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Programs() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { items: programs, sentinelRef, hasMore, loading, initialLoading, reload } = useServerInfiniteList<types.Program>({
    fetcher: (offset, limit) => programAPI.list({ offset, limit, q: debouncedSearch || undefined }),
    deps: [debouncedSearch],
  })

  if (initialLoading) return <Loading />

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Programs</h1>
          <p className="text-tx-muted text-sm mt-0.5">Reusable workout templates</p>
        </div>
        <button onClick={() => navigate('/programs/new')} className="btn-primary btn-md">
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
        {programs.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-tx-muted" />
            </div>
            <p className="text-sm font-medium text-tx-primary mb-1">No programs found</p>
            <p className="text-xs text-tx-muted">{search ? 'Try a different search' : 'Create a program to get started'}</p>
          </div>
        ) : (
          <>
            {programs.map(p => (
              <ProgramCard
                key={p.id}
                program={p}
                onEdit={(id) => navigate(`/programs/${id}/edit`)}
                onDelete={() => reload()}
              />
            ))}
            <div ref={sentinelRef} />
            {hasMore && loading && (
              <p className="text-center text-xs text-tx-muted py-2">Loading more…</p>
            )}
          </>
        )}
      </div>

    </div>
  )
}
