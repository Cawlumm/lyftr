import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Timer, CheckCircle2, Plus, Trash2, X, Dumbbell, Flag,
  AlertCircle, ChevronRight, ChevronLeft, Info,
} from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useSettingsStore, weightShort } from '../stores/settings'
import { workoutAPI } from '../services/api'
import * as types from '../types'
import { muscleColor } from '../utils/exerciseUtils'

function ExerciseNotes({ exIdx, notes, onSave }: { exIdx: number; notes: string; onSave: (i: number, v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(notes)

  const commit = () => { onSave(exIdx, val); setEditing(false) }

  if (editing) {
    return (
      <div className="px-4 pb-2">
        <input
          autoFocus
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(notes); setEditing(false) } }}
          placeholder="Add a note…"
          className="input text-sm w-full"
        />
      </div>
    )
  }

  return (
    <div className="px-4 pb-2">
      <button
        onClick={() => { setVal(notes); setEditing(true) }}
        className="text-xs text-tx-muted hover:text-tx-secondary transition-colors"
      >
        {notes ? <span className="italic">{notes}</span> : <span className="opacity-50">+ Add note</span>}
      </button>
    </div>
  )
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const { session, updateSet, updateExerciseNotes, completeSet, addSet, removeSet, removeExercise, buildPayload, cancelSession } =
    useWorkoutSession()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  const [elapsed, setElapsed] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeExIdx, setActiveExIdx] = useState(0)

  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Workout elapsed timer
  useEffect(() => {
    if (!session) return
    const started = new Date(session.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session?.started_at])

  if (!session) {
    return (
      <div className="empty-state py-20">
        <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
          <Dumbbell className="w-6 h-6 text-tx-muted" />
        </div>
        <p className="text-sm font-medium text-tx-primary mb-1">No active workout</p>
        <p className="text-xs text-tx-muted mb-4">Start one from the home page</p>
        <button onClick={() => navigate('/')} className="btn-primary btn-sm">Go Home</button>
      </div>
    )
  }

  const handleFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const payload = buildPayload()
      await workoutAPI.create(payload)
      cancelSession()
      navigate('/workouts')
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Failed to save workout')
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  const handleCompleteSet = (exIdx: number, setIdx: number) => {
    completeSet(exIdx, setIdx)
    if (exIdx !== activeExIdx) setActiveExIdx(exIdx)
  }

  const advanceActiveExercise = (fromIdx: number) => {
    const next = fromIdx + 1
    setActiveExIdx(next)
    requestAnimationFrame(() => {
      cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const jumpToExercise = (idx: number) => {
    setActiveExIdx(idx)
    requestAnimationFrame(() => {
      cardRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const completedSets = session.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0)
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const allComplete = totalSets > 0 && completedSets === totalSets

  return (
    <div className="animate-slide-up pb-28">

      {/* ── Sticky header ──────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-surface-base/95 backdrop-blur border-b border-surface-border/60 -mx-4 px-4 pt-3 pb-0 mb-4">

        <div className="flex items-center justify-between gap-3 pb-2.5">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-lg text-tx-primary truncate leading-tight">{session.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-sm font-mono text-brand-400">
                <Timer className="w-3.5 h-3.5" />
                {formatElapsed(elapsed)}
              </span>
              <span className="text-xs text-tx-muted">{completedSets}/{totalSets} sets done</span>
            </div>
          </div>
          <button
            onClick={() => setConfirmFinish(true)}
            className={`flex items-center gap-2 px-5 py-2.5 font-semibold rounded-xl transition-all text-sm flex-shrink-0 ${
              allComplete
                ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/30 scale-105'
                : 'bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30'
            }`}
          >
            <Flag className="w-4 h-4" />
            Finish
          </button>
        </div>

        {/* Overall progress bar */}
        <div className="h-0.5 bg-surface-muted">
          <div
            className="h-full bg-brand-500 transition-all duration-500"
            style={{ width: `${totalSets > 0 ? (completedSets / totalSets) * 100 : 0}%` }}
          />
        </div>

        {/* Named exercise pills */}
        {session.exercises.length > 1 && (
          <div className="flex items-center gap-1.5 py-2 overflow-x-auto no-scrollbar">
            {session.exercises.map((ex, i) => {
              const done = ex.sets.length > 0 && ex.sets.every(s => s.completed)
              const active = i === activeExIdx
              return (
                <button
                  key={i}
                  onClick={() => jumpToExercise(i)}
                  title={ex.exercise.name}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-200 ${
                    done
                      ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                      : active
                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 shadow-sm shadow-brand-500/10'
                        : 'bg-surface-muted/50 border-surface-border text-tx-muted'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold leading-none ${
                      active ? 'bg-brand-400 text-white' : 'bg-surface-border text-tx-muted'
                    }`}>{i + 1}</span>
                  )}
                  <span className="max-w-[5.5rem] truncate">{ex.exercise.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {saveError && (
        <div className="alert-error mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* ── Exercise list ───────────────────────────────────── */}
      <div className="space-y-3">
        {session.exercises.length === 0 ? (
          <div className="empty-state py-16">
            <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-4">
              <Dumbbell className="w-6 h-6 text-tx-muted" />
            </div>
            <p className="text-sm font-medium text-tx-primary mb-1">No exercises yet</p>
            <p className="text-xs text-tx-muted">Add exercises below</p>
          </div>
        ) : (
          session.exercises.map((ex, exIdx) => {
            const allSetsComplete = ex.sets.length > 0 && ex.sets.every(s => s.completed)
            const isActive = exIdx === activeExIdx
            const completedHere = ex.sets.filter(s => s.completed).length

            return (
              <div
                key={exIdx}
                ref={el => { cardRefs.current[exIdx] = el }}
                className={`rounded-2xl overflow-hidden transition-all duration-200 ${
                  allSetsComplete
                    ? 'border-2 border-brand-500/30 bg-brand-500/[0.03] shadow-sm'
                    : isActive
                      ? 'border-2 border-brand-500/40 bg-surface-base shadow-md shadow-brand-500/10'
                      : 'border border-surface-border bg-surface-base'
                }`}
              >
                {/* Exercise header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  {ex.exercise.image_url ? (
                    <img
                      src={ex.exercise.image_url}
                      alt=""
                      loading="lazy"
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                      allSetsComplete
                        ? 'bg-brand-500/15 border-brand-500/30'
                        : 'bg-brand-500/10 border-brand-500/20'
                    }`}>
                      <Dumbbell className="w-5 h-5 text-brand-500" />
                    </div>
                  )}

                  {/* Name + muscle + progress — taps to info page */}
                  <button
                    onClick={() => navigate(`/workout/active/exercise/${ex.exercise_id}`)}
                    className="flex-1 min-w-0 text-left group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-semibold text-tx-primary truncate leading-tight group-hover:text-brand-400 transition-colors">
                        {ex.exercise.name}
                      </span>
                      <Info className="w-3.5 h-3.5 text-tx-muted flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${muscleColor(ex.exercise.muscle_group)}`}>
                        {ex.exercise.muscle_group}
                      </span>
                      <span className="text-xs text-tx-muted tabular-nums">{completedHere}/{ex.sets.length} sets</span>
                    </div>
                  </button>

                  {/* Done badge OR remove button */}
                  {allSetsComplete ? (
                    <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-500/30">
                      <CheckCircle2 className="w-4.5 h-4.5 text-white" />
                    </div>
                  ) : (
                    <button
                      onClick={() => removeExercise(exIdx)}
                      className="w-9 h-9 flex items-center justify-center hover:bg-error-500/10 rounded-xl transition-colors flex-shrink-0 group/rm"
                      aria-label="Remove exercise"
                    >
                      <X className="w-4 h-4 text-tx-muted group-hover/rm:text-error-400 transition-colors" />
                    </button>
                  )}
                </div>

                {/* Notes */}
                <ExerciseNotes exIdx={exIdx} notes={ex.notes} onSave={updateExerciseNotes} />

                {/* Sets */}
                <div className="px-3 pb-3 space-y-2">
                  {/* Column labels */}
                  <div className="grid grid-cols-[2rem_1fr_1fr_3.5rem_2rem] gap-2 px-1">
                    <span className="text-xs text-tx-muted font-medium text-center">Set</span>
                    <span className="text-xs text-tx-muted font-medium text-center">Reps</span>
                    <span className="text-xs text-tx-muted font-medium text-center">Weight</span>
                    <span className="text-xs text-tx-muted font-medium text-center">Done</span>
                    <span />
                  </div>

                  {ex.sets.map((set, setIdx) => {
                    const isNextSet = isActive && !set.completed && ex.sets.slice(0, setIdx).every(s => s.completed)
                    return (
                      <div
                        key={setIdx}
                        className={`grid grid-cols-[2rem_1fr_1fr_3.5rem_2rem] gap-2 items-stretch rounded-xl border transition-all duration-200 ${
                          set.completed
                            ? 'bg-brand-500/10 border-brand-500/20'
                            : isNextSet
                              ? 'bg-surface-muted/50 border-brand-500/35 shadow-sm shadow-brand-500/10'
                              : 'bg-surface-muted/30 border-surface-border/60'
                        }`}
                      >
                        {/* Set number */}
                        <div className="flex items-center justify-center py-3 rounded-l-xl">
                          <span className={`text-sm font-bold tabular-nums ${
                            set.completed ? 'text-brand-400' : isNextSet ? 'text-brand-300' : 'text-tx-muted'
                          }`}>{set.set_number}</span>
                        </div>

                        {/* Reps */}
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.actual_reps || ''}
                          onChange={e => updateSet(exIdx, setIdx, 'actual_reps', Number(e.target.value) || 0)}
                          placeholder={set.target_reps > 0 ? String(set.target_reps) : '—'}
                          className={`input text-base text-center py-3 transition-opacity ${set.completed ? 'opacity-40' : ''}`}
                          disabled={set.completed}
                        />

                        {/* Weight */}
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.actual_weight || ''}
                            onChange={e => updateSet(exIdx, setIdx, 'actual_weight', Number(e.target.value) || 0)}
                            placeholder={set.target_weight > 0 ? String(set.target_weight) : '—'}
                            className={`input text-base text-center py-3 w-full pr-7 transition-opacity ${set.completed ? 'opacity-40' : ''}`}
                            disabled={set.completed}
                            step="0.5"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none">{wUnit}</span>
                        </div>

                        {/* Complete toggle */}
                        <button
                          onClick={() => handleCompleteSet(exIdx, setIdx)}
                          className={`flex items-center justify-center transition-colors min-h-[3rem] ${
                            set.completed
                              ? 'bg-brand-500 hover:bg-brand-600'
                              : isNextSet
                                ? 'bg-brand-500/20 hover:bg-brand-500/30'
                                : 'hover:bg-brand-500/10'
                          }`}
                        >
                          <CheckCircle2 className={`w-6 h-6 transition-colors ${
                            set.completed ? 'text-white' : isNextSet ? 'text-brand-400' : 'text-tx-muted/40'
                          }`} />
                        </button>

                        {/* Remove set */}
                        <button
                          onClick={() => removeSet(exIdx, setIdx)}
                          className="flex items-center justify-center rounded-r-xl hover:bg-error-500/10 transition-colors group/del"
                          aria-label="Remove set"
                        >
                          <X className="w-3.5 h-3.5 text-tx-muted/40 group-hover/del:text-error-400 transition-colors" />
                        </button>
                      </div>
                    )
                  })}

                  {/* Add Set / Prev / Next row */}
                  <div className="flex gap-2 mt-1">
                    {isActive && exIdx > 0 && (
                      <button
                        onClick={() => jumpToExercise(exIdx - 1)}
                        className="py-2.5 px-3 flex items-center justify-center rounded-xl bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary border border-surface-border transition-colors"
                        aria-label="Previous exercise"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => addSet(exIdx)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border hover:border-brand-500/40 hover:bg-brand-500/5 text-xs font-medium text-tx-muted hover:text-brand-400 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Set
                    </button>

                    {isActive && exIdx < session.exercises.length - 1 && (
                      <button
                        onClick={() => advanceActiveExercise(exIdx)}
                        className={`py-2.5 px-3 flex items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
                          allSetsComplete
                            ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                            : 'bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary border border-surface-border'
                        }`}
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isActive && exIdx === session.exercises.length - 1 && (
                      <button
                        onClick={() => setConfirmFinish(true)}
                        className={`py-2.5 px-3 flex items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
                          allSetsComplete
                            ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                            : 'bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary border border-surface-border'
                        }`}
                      >
                        <Flag className="w-3.5 h-3.5" />
                        Finish
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="mt-4 space-y-2">
        <button
          onClick={() => navigate('/workout/active/add-exercise')}
          className="w-full py-3.5 bg-surface-muted/60 hover:bg-surface-muted border border-surface-border hover:border-brand-500/40 rounded-2xl text-sm font-medium text-tx-secondary hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Exercise
        </button>

        <button
          onClick={() => setConfirmCancel(true)}
          className="w-full py-2.5 text-xs text-tx-muted hover:text-error-400 transition-colors"
        >
          Cancel Workout
        </button>
      </div>

      {/* ── Finish confirm ─────────────────────────────────── */}
      {confirmFinish && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Finish Workout?</h3>
            <p className="text-sm text-tx-muted mb-5">
              {completedSets} of {totalSets} sets completed. Workout will be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinish(false)}
                className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Finish'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Cancel confirm ─────────────────────────────────── */}
      {confirmCancel && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Cancel Workout?</h3>
            <p className="text-sm text-tx-muted mb-5">All progress will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={() => { cancelSession(); navigate('/') }}
                className="flex-1 py-3 bg-error-500 hover:bg-error-600 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
