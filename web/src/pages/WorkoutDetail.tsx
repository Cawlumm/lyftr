import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, Clock, Dumbbell, TrendingUp, Edit2, Trash2, ChevronRight, AlertCircle, Loader,
} from 'lucide-react'
import { workoutAPI } from '../services/api'
import { useSettingsStore, weightShort, lbsToDisplay } from '../stores/settings'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

function SetChip({ set, isBest, unit }: { set: types.Set; isBest: boolean; unit: string }) {
  return (
    <div className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums leading-none ${
      isBest
        ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25'
        : 'bg-surface-raised text-tx-secondary'
    }`}>
      {set.reps > 0 ? set.reps : '—'} × {set.weight > 0 ? `${Math.round(lbsToDisplay(set.weight, unit))} ${unit}` : 'BW'}
    </div>
  )
}

export default function WorkoutDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [workout, setWorkout] = useState<types.Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await workoutAPI.get(Number(id))
        setWorkout(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load workout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleDelete = async () => {
    if (!workout) return
    setDeleting(true)
    try {
      await workoutAPI.delete(workout.id)
      navigate('/workouts', { replace: true })
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

  if (error || !workout) {
    return (
      <div className="space-y-4">
        <Link to="/workouts" className="flex items-center gap-2 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || 'Workout not found'}</span>
        </div>
      </div>
    )
  }

  const exs = workout.exercises ?? []
  const totalVolume = Math.round(lbsToDisplay(
    exs.reduce((s, ex) => s + (ex.sets ?? []).reduce((ss, set) => ss + set.reps * set.weight, 0), 0),
    wUnit
  ))
  const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)
  const durationMin = Math.round(workout.duration / 60)

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link to="/workouts" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Workouts
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/workouts/${workout.id}/edit`)}
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
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Delete Workout?</h3>
            <p className="text-sm text-tx-muted mb-5">"{workout.name}" will be permanently deleted.</p>
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
              <Dumbbell className="w-6 h-6 text-brand-500" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-xl text-tx-primary leading-tight">{workout.name}</h1>
            <p className="text-sm text-tx-muted mt-0.5">
              {format(new Date(workout.started_at), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-surface-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock className="w-3.5 h-3.5 text-tx-muted" />
              <p className="text-xs text-tx-muted">Duration</p>
            </div>
            <p className="text-lg font-bold text-tx-primary tabular-nums">{durationMin}<span className="text-xs font-normal text-tx-muted ml-0.5">min</span></p>
          </div>
          <div className="text-center border-x border-surface-border">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Dumbbell className="w-3.5 h-3.5 text-tx-muted" />
              <p className="text-xs text-tx-muted">Sets</p>
            </div>
            <p className="text-lg font-bold text-tx-primary tabular-nums">{totalSets}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-tx-muted" />
              <p className="text-xs text-tx-muted">Volume</p>
            </div>
            <p className="text-lg font-bold text-tx-primary tabular-nums">
              {totalVolume > 0 ? `${totalVolume.toLocaleString()}` : '—'}
              {totalVolume > 0 && <span className="text-xs font-normal text-tx-muted ml-0.5">{wUnit}</span>}
            </p>
          </div>
        </div>

        {workout.notes && (
          <p className="text-sm text-tx-muted mt-3 pt-3 border-t border-surface-border">{workout.notes}</p>
        )}
      </div>

      {/* Exercises */}
      <div className="space-y-3">
        {exs.map((ex, idx) => {
          const sets = ex.sets ?? []
          const maxWeightLbs = sets.length > 0 ? Math.max(...sets.map(s => s.weight || 0)) : 0
          const maxWeight = Math.round(lbsToDisplay(maxWeightLbs, wUnit))
          const exVol = Math.round(lbsToDisplay(sets.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0), wUnit))

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
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {ex.exercise?.muscle_group && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${muscleColor(ex.exercise.muscle_group)}`}>
                        {ex.exercise.muscle_group}
                      </span>
                    )}
                    <span className="text-xs text-tx-muted">{sets.length} sets</span>
                    {exVol > 0 && <span className="text-xs text-tx-muted">{exVol.toLocaleString()} {wUnit}</span>}
                  </div>
                </div>
                {maxWeight > 0 && (
                  <div className="text-right flex-shrink-0 mr-1">
                    <p className="text-[10px] text-tx-muted uppercase tracking-wide">best</p>
                    <p className="text-sm font-bold text-brand-400 tabular-nums">{maxWeight} {wUnit}</p>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
              </div>

              {sets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-4 pt-0 border-t border-surface-border/50">
                  <div className="w-full pt-3" />
                  {sets.map((set, i) => (
                    <SetChip key={i} set={set} isBest={set.weight === maxWeightLbs && maxWeightLbs > 0} unit={wUnit} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
