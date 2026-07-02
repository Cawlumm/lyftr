import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, BookOpen, Dumbbell, Edit2, Trash2, Play, AlertCircle, Loader, ChevronRight, Pause, TimerOff,
  Award, TrendingUp, Check, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { programAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { useSettingsStore, weightShort, displayWeight } from '../stores/settings'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

// Rows shown before the review banner collapses behind a "Show all" toggle (#40).
const SUGGESTION_CAP = 3

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, startSession } = useWorkoutSession()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const restOn = settings.rest_enabled ?? true
  const restLabel = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60}m` : `${s}s`)
  const [program, setProgram] = useState<types.Program | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)

  // Accept (apply → target) or dismiss staged auto-progression suggestions (#40),
  // then refresh from the returned program.
  const resolveSuggestions = async (accept: number[], dismiss: number[]) => {
    if (!program || resolving) return
    setResolving(true)
    try {
      const updated = await programAPI.resolveSuggestions(program.id, { accept, dismiss })
      setProgram(updated)
    } catch {
      /* leave the banner in place so the user can retry */
    } finally {
      setResolving(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const data = await programAPI.get(Number(id))
        setProgram(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load program')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleStart = () => {
    if (!program) return
    if (session) { navigate('/workout/start'); return }
    const exercises: types.ActiveSessionExercise[] = (program.exercises || []).map(ex => ({
      exercise_id: ex.exercise_id,
      exercise: ex.exercise,
      notes: ex.notes || '',
      rest_seconds: ex.rest_seconds,
      sets: (ex.sets || []).map(s => ({
        set_number: s.set_number,
        target_reps: s.target_reps,
        target_weight: s.target_weight,
        actual_reps: s.target_reps,
        actual_weight: s.target_weight,
        completed: false,
        program_set_id: s.id, // link for routine target auto-progression (#40)
      })),
    }))
    startSession(program.name, exercises, program.id)
    navigate('/workout/active')
  }

  const handleDelete = async () => {
    if (!program) return
    setDeleting(true)
    try {
      await programAPI.delete(program.id)
      navigate('/programs', { replace: true })
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="space-y-4">
        <Link to="/programs" className="flex items-center gap-2 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || 'Program not found'}</span>
        </div>
      </div>
    )
  }

  const exs = program.exercises ?? []
  const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)

  // Pending auto-progression suggestions (#40), flattened for the review banner. A
  // suggestion exists when suggested_reps is set. Show the FULL reps×weight on both
  // sides when both changed (a heavier set can also drop the rep target — the user
  // must see that before approving), else the single changed dimension.
  const suggestions = exs.flatMap(ex =>
    (ex.sets ?? [])
      .filter(s => s.id != null && s.suggested_reps != null)
      .map(s => {
        const sw = s.suggested_weight as number
        const sr = s.suggested_reps as number
        const weightChanged = s.suggested_weight != null && Math.abs(sw - s.target_weight) > 1e-6
        const repsChanged = sr !== s.target_reps
        const wLabel = (v: number) => (v > 0 ? `${displayWeight(v, wUnit)} ${wUnit}` : 'BW')
        let oldLabel: string, newLabel: string
        if (weightChanged && repsChanged) {
          oldLabel = `${s.target_reps} × ${wLabel(s.target_weight)}`
          newLabel = `${sr} × ${wLabel(sw)}`
        } else if (weightChanged) {
          oldLabel = wLabel(s.target_weight)
          newLabel = wLabel(sw)
        } else {
          oldLabel = `${s.target_reps}`
          newLabel = `${sr} reps`
        }
        return {
          setId: s.id as number,
          exName: ex.exercise?.name ?? 'Exercise',
          setNumber: s.set_number,
          isPR: !!s.suggested_is_pr,
          oldLabel,
          newLabel,
        }
      })
  )
  const suggestedSetIds = suggestions.map(s => s.setId)

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link to="/programs" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Programs
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={handleStart}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Start Workout
          </button>
          <button
            onClick={() => navigate(`/programs/${program.id}/edit`)}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-brand-500" />
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="p-2 hover:bg-error-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-error-400" />
          </button>
        </div>
      </div>

      {/* Delete confirm — bottom sheet */}
      {confirming && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Delete Program?</h3>
            <p className="text-sm text-tx-muted mb-5">"{program.name}" will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)} className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Auto-progression review banner (#40) — approve the targets you beat last workout */}
      {suggestions.length > 0 && (
        <div className="bg-surface-raised border border-warning-500/30 rounded-xl overflow-hidden animate-slide-up">
          <div className="flex items-center gap-2 px-4 py-3">
            {suggestions.some(s => s.isPR)
              ? <Award className="w-4 h-4 text-warning-400 flex-shrink-0" />
              : <TrendingUp className="w-4 h-4 text-warning-400 flex-shrink-0" />}
            <span className="text-sm font-semibold text-tx-primary flex-1">New targets from your last workout</span>
            <span className="text-xs font-bold text-warning-400 bg-warning-500/15 px-2 py-0.5 rounded-full tabular-nums">{suggestions.length}</span>
          </div>
          {(showAllSuggestions ? suggestions : suggestions.slice(0, SUGGESTION_CAP)).map(sg => (
            <div key={sg.setId} className="flex items-center gap-3 px-4 py-2.5 border-t border-surface-border/60">
              <span className="text-sm text-tx-secondary min-w-0 flex-1 truncate flex items-center gap-1.5">
                {sg.isPR && <Award className="w-3.5 h-3.5 text-warning-400 flex-shrink-0" />}
                <span className="truncate"><span className="font-semibold text-tx-primary">{sg.exName}</span> · Set {sg.setNumber}</span>
              </span>
              <span className="text-sm tabular-nums whitespace-nowrap flex-shrink-0">
                <span className="text-tx-muted line-through">{sg.oldLabel}</span>
                <span className="text-warning-400 mx-1.5">→</span>
                <span className="text-tx-primary font-bold">{sg.newLabel}</span>
              </span>
              <span className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => resolveSuggestions([sg.setId], [])}
                  disabled={resolving}
                  aria-label={`Accept ${sg.exName} set ${sg.setNumber}`}
                  className="w-7 h-7 rounded-lg bg-success-500/15 text-success-400 hover:bg-success-500/25 disabled:opacity-50 flex items-center justify-center transition-colors"
                >
                  <Check className="w-4 h-4" strokeWidth={3} />
                </button>
                <button
                  onClick={() => resolveSuggestions([], [sg.setId])}
                  disabled={resolving}
                  aria-label={`Dismiss ${sg.exName} set ${sg.setNumber}`}
                  className="w-7 h-7 rounded-lg bg-surface-muted text-tx-muted hover:text-tx-primary disabled:opacity-50 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" strokeWidth={3} />
                </button>
              </span>
            </div>
          ))}
          {suggestions.length > SUGGESTION_CAP && (
            <button
              onClick={() => setShowAllSuggestions(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-surface-border/60 text-warning-400 hover:text-warning-300 text-xs font-semibold transition-colors"
            >
              {showAllSuggestions
                ? <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
                : <>Show all {suggestions.length} <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          )}
          <div className="flex gap-2 px-4 py-3 border-t border-surface-border/60">
            <button
              onClick={() => resolveSuggestions([], suggestedSetIds)}
              disabled={resolving}
              className="flex-1 py-2 rounded-lg bg-surface-muted border border-surface-border text-tx-secondary hover:text-tx-primary disabled:opacity-50 text-sm font-medium transition-colors"
            >
              Dismiss all
            </button>
            <button
              onClick={() => resolveSuggestions(suggestedSetIds, [])}
              disabled={resolving}
              className="flex-1 py-2 rounded-lg bg-warning-500 hover:bg-warning-400 disabled:opacity-50 text-[#1a1400] text-sm font-semibold transition-colors"
            >
              Apply all ({suggestions.length})
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          {exs[0]?.exercise?.image_url ? (
            <img
              src={exs[0].exercise.image_url}
              alt=""
              className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-brand-500" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-xl text-tx-primary leading-tight">{program.name}</h1>
            <p className="text-sm text-tx-muted mt-0.5">
              Created {format(new Date(program.created_at), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-surface-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Dumbbell className="w-3.5 h-3.5 text-tx-muted" />
              <p className="text-xs text-tx-muted">Exercises</p>
            </div>
            <p className="text-lg font-bold text-tx-primary tabular-nums">{exs.length}</p>
          </div>
          <div className="text-center border-l border-surface-border">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <BookOpen className="w-3.5 h-3.5 text-tx-muted" />
              <p className="text-xs text-tx-muted">Total Sets</p>
            </div>
            <p className="text-lg font-bold text-tx-primary tabular-nums">{totalSets}</p>
          </div>
        </div>

        {program.notes && (
          <p className="text-sm text-tx-muted mt-3 pt-3 border-t border-surface-border">{program.notes}</p>
        )}
      </div>

      {/* Exercises */}
      {!restOn && (
        <div className="flex items-center gap-1.5 text-[11px] text-tx-muted px-1">
          <TimerOff className="w-3.5 h-3.5" /> Rest timer is off — turn it on in Settings
        </div>
      )}
      <div className="space-y-2">
        {exs.map((ex) => {
          const sets = ex.sets ?? []
          const maxTargetLbs = sets.length > 0 ? Math.max(...sets.map(s => s.target_weight || 0)) : 0
          const maxTarget = displayWeight(maxTargetLbs, wUnit)

          return (
            <button
              key={ex.id}
              onClick={() => navigate(`/exercises/${ex.exercise_id}`)}
              className="card w-full overflow-hidden text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3 p-4">
                {ex.exercise?.image_url ? (
                  <img
                    src={ex.exercise.image_url}
                    alt=""
                    className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="w-5 h-5 text-brand-500" strokeWidth={2} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-tx-primary truncate">{ex.exercise?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ex.exercise?.muscle_group && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${muscleColor(ex.exercise.muscle_group)}`}>
                        {ex.exercise.muscle_group}
                      </span>
                    )}
                    <span className="text-xs text-tx-muted truncate">{sets.length} sets{maxTarget > 0 ? ` · target ${maxTarget} ${wUnit}` : ''}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
              </div>

              {sets.length > 0 && (
                <div className="flex items-center gap-2 px-4 pb-4 border-t border-surface-border/50 pt-3">
                  <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                    {sets.map((set, i) => {
                      const isBest = set.target_weight === maxTargetLbs && maxTargetLbs > 0
                      const hasSuggestion = set.suggested_reps != null
                      return (
                        <div key={i} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums leading-none ${
                          hasSuggestion ? 'bg-warning-500/10 text-tx-secondary ring-1 ring-warning-500/40'
                            : isBest ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25' : 'bg-surface-raised text-tx-secondary'
                        }`}>
                          {set.target_reps > 0 ? set.target_reps : '—'} × {set.target_weight > 0 ? `${displayWeight(set.target_weight, wUnit)} ${wUnit}` : 'BW'}
                        </div>
                      )
                    })}
                  </div>
                  {restOn && (ex.rest_seconds === 0
                    ? <span className="text-xs text-tx-muted flex-shrink-0">No rest</span>
                    : <span className="flex items-center gap-1 text-xs text-tx-muted flex-shrink-0"><Pause className="w-3.5 h-3.5" />{restLabel(ex.rest_seconds ?? 90)}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
