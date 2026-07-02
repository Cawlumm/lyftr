import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Plus, X, Dumbbell, Flag, ChevronRight, ChevronLeft, Play,
  Minimize2, Trash2, Repeat, Check, Layers, Timer,
} from 'lucide-react'
import Model, { IExerciseData } from 'react-body-highlighter'
import * as types from '../types'
import { muscleColor, muscleColorBordered, EQUIPMENT_LABEL, muscleToBodySlugs } from '../utils/exerciseUtils'
import { useTheme } from '../hooks/useTheme'
import { useWorkoutSession } from '../stores/workoutSession'
import { useSettingsStore } from '../stores/settings'
import RestPicker from '../components/RestPicker'
import RestTimerBanner from '../components/RestTimerBanner'
import { workoutAPI } from '../services/api'
import StepperTile from '../components/ui/StepperTile'
import NumberField from '../components/ui/NumberField'
import DiscardConfirm from '../components/DiscardConfirm'
import { clampStep, clampValue } from '../utils/number'
import { nextIncompleteSet } from '../utils/workoutSets'
import { displayWeight, displayToLbs } from '../stores/settings'

function buildBodyData(exercise: types.Exercise): IExerciseData[] {
  const primarySlugs = muscleToBodySlugs(exercise.muscle_group)
  const secondarySlugs = (exercise.secondary_muscles || [])
    .flatMap(m => muscleToBodySlugs(m))
    .filter(s => !primarySlugs.includes(s))
  const data: IExerciseData[] = []
  if (primarySlugs.length > 0) data.push({ name: 'Primary', muscles: primarySlugs as any, frequency: 2 })
  if (secondarySlugs.length > 0) data.push({ name: 'Secondary', muscles: secondarySlugs as any, frequency: 1 })
  return data
}

function ExerciseNotes({ exIdx, notes, onSave }: { exIdx: number; notes: string; onSave: (i: number, v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(notes)
  const commit = () => { onSave(exIdx, val); setEditing(false) }
  if (editing) {
    return (
      <input
        autoFocus type="text" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(notes); setEditing(false) } }}
        placeholder="Add a note…"
        className="input text-sm w-full"
      />
    )
  }
  return (
    <button
      onClick={() => { setVal(notes); setEditing(true) }}
      className="text-xs text-tx-muted hover:text-tx-secondary transition-colors text-left w-full"
    >
      {notes ? <span className="italic">{notes}</span> : <span className="opacity-50">+ Add note</span>}
    </button>
  )
}

interface GymModeWorkoutProps {
  wUnit: string
}

export default function GymModeWorkout({ wUnit }: GymModeWorkoutProps) {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const {
    session, minimizeGym,
    gymPhase: phase, gymExIdx: activeIdx, gymSetIdx: activeSetIdx, setGymState,
    updateSet, completeSet, addSet, removeSet, removeExercise, updateExerciseNotes,
    buildPayload, cancelSession,
    startRest, clearRest, restExIdx, restSetIdx, setExerciseRest,
  } = useWorkoutSession()
  const { settings } = useSettingsStore()

  const [imgFailed, setImgFailed] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const setPhase = (p: typeof phase) => setGymState(p, activeIdx, activeSetIdx)
  const onSetActiveIdx = (i: number) => setGymState(phase, i, 0)
  const setActiveSetIdx = (i: number) => setGymState(phase, activeIdx, i)

  useEffect(() => { setImgFailed(false) }, [activeIdx])

  if (!session) return null

  const handleFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const payload = buildPayload()
      const saved = await workoutAPI.create(payload)
      cancelSession()
      minimizeGym()
      // Surface the routine auto-progression as a toast on the workouts list (#40).
      navigate('/workouts', saved?.progression ? { state: { progression: saved.progression } } : undefined)
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Failed to save workout')
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  const handleMinimize = () => {
    minimizeGym()
    // Navigate away from /workout/active so list mode doesn't show underneath
    if (window.location.pathname === '/workout/active') navigate('/')
  }

  // Jump to newly added exercise
  const prevLenRef = useRef(session.exercises.length)
  useEffect(() => {
    if (session.exercises.length > prevLenRef.current) {
      onSetActiveIdx(session.exercises.length - 1)
    }
    prevLenRef.current = session.exercises.length
  }, [session.exercises.length])

  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0)

  const bodyColor = isDark ? '#162240' : '#e2e8f0'
  const highlightColors = ['#0e7490', '#22d3ee']

  // ── Shared top bar (exercise-info + exercise phases) ──────────────────
  function TopBar({ onBack, s }: { onBack: () => void; s: types.ActiveSession }) {
    const allDone = completedSets === totalSets && totalSets > 0
    return (
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-surface-border flex-shrink-0">
        <button
          onClick={onBack}
          className="p-2 hover:bg-surface-muted rounded-xl transition-colors text-tx-muted"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
            {s.exercises.map((_, i) => (
              <button
                key={i}
                onClick={() => setGymState('exercise-info', i, 0)}
                aria-label={`Go to exercise ${i + 1}`}
                className={`h-1.5 rounded-full flex-shrink-0 transition-all duration-200 ${
                  i === activeIdx ? 'w-6 bg-brand-500' :
                  s.exercises[i].sets.every(st => st.completed) && s.exercises[i].sets.length > 0
                    ? 'w-2 bg-brand-500/40' : 'w-2 bg-surface-border'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-tx-muted tabular-nums flex-shrink-0">{activeIdx + 1}/{s.exercises.length}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setConfirmFinish(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              allDone
                ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                : 'bg-surface-muted text-tx-muted border border-surface-border'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            Finish
          </button>
          <button
            onClick={handleMinimize}
            className="p-2 hover:bg-surface-muted rounded-xl transition-colors text-tx-muted"
            aria-label="Minimize workout"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmCancel(true)}
            className="p-2 hover:bg-error-500/10 rounded-xl transition-colors text-tx-muted hover:text-error-400"
            aria-label="Discard workout"
            title="Discard workout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────────────────
  if (phase === 'overview') {
    return (
      <div className="fixed inset-0 z-[60] bg-surface-base overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border flex-shrink-0">
          <div>
            <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-0.5">Workout</p>
            <h1 className="font-display font-bold text-xl text-tx-primary leading-tight">{session.name}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleMinimize} className="p-2 hover:bg-surface-muted rounded-xl transition-colors text-tx-muted" aria-label="Minimize">
              <Minimize2 className="w-4 h-4" />
            </button>
            <button onClick={() => setConfirmCancel(true)} aria-label="Discard workout" title="Discard workout" className="p-2 hover:bg-surface-muted rounded-xl transition-colors text-tx-muted hover:text-error-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div className="text-center">
            <p className="text-xl font-bold text-tx-primary tabular-nums">{session.exercises.length}</p>
            <p className="text-[10px] text-tx-muted uppercase tracking-wide mt-0.5">Exercises</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-tx-primary tabular-nums">{totalSets}</p>
            <p className="text-[10px] text-tx-muted uppercase tracking-wide mt-0.5">Total Sets</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-tx-primary tabular-nums">
              {[...new Set(session.exercises.map(e => e.exercise.muscle_group))].length}
            </p>
            <p className="text-[10px] text-tx-muted uppercase tracking-wide mt-0.5">Muscles</p>
          </div>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {session.exercises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Dumbbell className="w-10 h-10 text-tx-muted/30" />
              <p className="text-sm text-tx-muted">No exercises added yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {session.exercises.map((ex, i) => {
                const done = ex.sets.length > 0 && ex.sets.every(s => s.completed)
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                    done ? 'border-brand-500/30 bg-brand-500/[0.04]' : 'border-surface-border bg-surface-base'
                  }`}>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-muted border border-surface-border flex items-center justify-center">
                      <span className={`text-sm font-bold ${done ? 'text-brand-400' : 'text-tx-muted'}`}>{i + 1}</span>
                    </div>
                    {ex.exercise.image_url ? (
                      <img src={ex.exercise.image_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Dumbbell className="w-4 h-4 text-brand-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-tx-primary truncate">{ex.exercise.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${muscleColor(ex.exercise.muscle_group)}`}>
                          {ex.exercise.muscle_group}
                        </span>
                        <span className="text-[10px] text-tx-muted">{ex.sets.length} sets</span>
                      </div>
                    </div>
                    {done && <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="px-5 pb-6 pt-4 border-t border-surface-border flex-shrink-0 space-y-2">
          <button
            onClick={() => navigate('/workout/active/add-exercise')}
            className="w-full py-3 bg-surface-muted/60 hover:bg-surface-muted border border-surface-border hover:border-brand-500/40 rounded-2xl text-sm font-medium text-tx-secondary hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>
          {session.exercises.length > 0 && (
            <button
              onClick={() => setGymState('exercise-info', 0, 0)}
              className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30 transition-colors"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Workout
            </button>
          )}
        </div>

        {confirmFinish && createPortal(
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
              <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
              <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Finish Workout?</h3>
              <p className="text-sm text-tx-muted mb-5">{completedSets} of {totalSets} sets completed. Workout will be saved.</p>
              {saveError && <p className="text-xs text-error-400 mb-3">{saveError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setConfirmFinish(false)} disabled={saving} className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 disabled:opacity-50 text-tx-secondary rounded-xl transition-colors font-medium text-sm">Keep Going</button>
                <button onClick={handleFinish} disabled={saving} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Finish'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        <DiscardConfirm open={confirmCancel} onKeep={() => setConfirmCancel(false)} onDiscard={() => { cancelSession(); handleMinimize() }} />
      </div>
    )
  }

  const ex = session.exercises[activeIdx]
  if (!ex) { onSetActiveIdx(0); return null }

  const isFirst = activeIdx === 0
  const isLast = activeIdx === session.exercises.length - 1

  // ── Exercise info ─────────────────────────────────────────────────────
  if (phase === 'exercise-info') {
    const exercise = ex.exercise
    const equipLabel = EQUIPMENT_LABEL[exercise.equipment?.toLowerCase()] || exercise.equipment
    const descLines = exercise.description
      ? exercise.description.split('\n').filter(l => l.trim())
      : []
    const bodyData = buildBodyData(exercise)
    // Plan summary: one value if every set matches, else a min–max range.
    const repsVals = ex.sets.map(s => s.target_reps).filter(r => r > 0)
    const wtVals = ex.sets.map(s => displayWeight(s.target_weight, wUnit)).filter(w => w > 0)
    const range = (a: number[]) => (a.length === 0 ? '—' : Math.min(...a) === Math.max(...a) ? String(Math.min(...a)) : `${Math.min(...a)}–${Math.max(...a)}`)
    const planStats = [
      { icon: Layers, label: 'Sets', value: <>{ex.sets.length}</> },
      { icon: Repeat, label: 'Reps', value: <>{range(repsVals)}</> },
      { icon: Dumbbell, label: 'Weight', value: <>{range(wtVals)}<span className="text-xs font-semibold text-tx-muted ml-0.5">{wUnit}</span></> },
    ]

    return (
      <div className="fixed inset-0 z-[60] bg-surface-base overflow-y-auto flex flex-col">
        <TopBar s={session} onBack={() => isFirst ? setPhase('overview') : setGymState('exercise', activeIdx - 1, 0)} />

        <div className="flex-1 overflow-y-auto">
          {/* Hero image */}
          {exercise.image_url && !imgFailed && (
            <img
              src={exercise.image_url}
              alt={exercise.name}
              onError={() => setImgFailed(true)}
              className="w-full h-52 object-cover bg-surface-muted"
            />
          )}

          <div className="px-5 pt-5 pb-4 space-y-5">
            {/* Name + muscle */}
            <div>
              <h2 className="font-display font-bold text-2xl text-tx-primary leading-tight">{exercise.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${muscleColorBordered(exercise.muscle_group)}`}>
                  {exercise.muscle_group}
                </span>
                {equipLabel && exercise.equipment !== 'other' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-muted border border-surface-border text-xs font-medium text-tx-secondary">
                    {equipLabel}
                  </span>
                )}
                {exercise.category && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-muted border border-surface-border text-xs font-medium text-tx-secondary capitalize">
                    {exercise.category}
                  </span>
                )}
              </div>
            </div>

            {/* Plan — what you're about to do, as an icon stat strip */}
            <div className="card p-4 grid grid-cols-3 divide-x divide-surface-border">
              {planStats.map(({ icon: Ico, label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 px-2">
                  <Ico className="w-4 h-4 text-brand-400" />
                  <span className="font-display font-bold text-xl text-tx-primary tabular-nums leading-none whitespace-nowrap">{value}</span>
                  <span className="text-[10px] font-medium text-tx-muted uppercase tracking-wider">{label}</span>
                </div>
              ))}
            </div>

            {/* Rest timer for this exercise */}
            <div className="card p-4">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-brand-500" />
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider">Rest between sets</p>
              </div>
              <p className="text-[11px] text-tx-muted mt-1 mb-3">Auto-starts when you complete a set</p>
              <RestPicker value={ex.rest_seconds ?? (settings.rest_seconds_default ?? 90)} onChange={secs => setExerciseRest(activeIdx, secs)} />
            </div>

            {/* Secondary muscles */}
            {exercise.secondary_muscles?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-2">Also works</p>
                <div className="flex flex-wrap gap-1.5">
                  {exercise.secondary_muscles.map(m => (
                    <span key={m} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${muscleColor(m)}`}>{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Muscle diagram */}
            {bodyData.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-3">Muscles Worked</p>
                <div className="flex items-start justify-center gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <Model data={bodyData} type="anterior" bodyColor={bodyColor} highlightedColors={highlightColors} style={{ width: '120px' }} />
                    <span className="text-xs text-tx-muted">Front</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Model data={bodyData} type="posterior" bodyColor={bodyColor} highlightedColors={highlightColors} style={{ width: '120px' }} />
                    <span className="text-xs text-tx-muted">Back</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 justify-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
                    <span className="text-xs text-tx-muted">Primary</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0e7490' }} />
                    <span className="text-xs text-tx-muted">Secondary</span>
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            {descLines.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-3">Instructions</p>
                <div className="space-y-2.5">
                  {descLines.map((line, i) => {
                    const stepMatch = line.match(/^(\d+\.)\s*(.*)/)
                    if (stepMatch) {
                      return (
                        <p key={i} className="text-sm text-tx-secondary leading-relaxed">
                          <span className="font-semibold text-tx-primary">{stepMatch[1]}</span>{' '}{stepMatch[2]}
                        </p>
                      )
                    }
                    return <p key={i} className="text-sm text-tx-secondary leading-relaxed">{line}</p>
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="px-5 pb-6 pt-4 border-t border-surface-border flex-shrink-0">
          <button
            onClick={() => setPhase('exercise')}
            className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30 transition-colors"
          >
            <Play className="w-5 h-5 fill-current" />
            Begin Exercise
          </button>
        </div>

        {confirmFinish && createPortal(
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
              <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
              <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Finish Workout?</h3>
              <p className="text-sm text-tx-muted mb-5">{completedSets} of {totalSets} sets completed. Workout will be saved.</p>
              {saveError && <p className="text-xs text-error-400 mb-3">{saveError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setConfirmFinish(false)} disabled={saving} className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 disabled:opacity-50 text-tx-secondary rounded-xl transition-colors font-medium text-sm">Keep Going</button>
                <button onClick={handleFinish} disabled={saving} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Finish'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        <DiscardConfirm open={confirmCancel} onKeep={() => setConfirmCancel(false)} onDiscard={() => { cancelSession(); handleMinimize() }} />
      </div>
    )
  }

  // ── Exercise sets ─────────────────────────────────────────────────────
  const allSetsComplete = ex.sets.length > 0 && ex.sets.every(s => s.completed)
  const completedHere = ex.sets.filter(s => s.completed).length
  const clampedSetIdx = Math.min(activeSetIdx, ex.sets.length - 1)
  const set = ex.sets[clampedSetIdx]

  const handleCompleteSetGym = (setIdx: number) => {
    const wasCompleted = ex.sets[setIdx].completed
    completeSet(activeIdx, setIdx)
    if (wasCompleted) {
      // Un-completing: cancel the running rest only if it belongs to this set.
      if (restExIdx === activeIdx && restSetIdx === setIdx) clearRest()
      return
    }
    // Completing: start rest (per-exercise value, else the global default; 0 = off).
    if (settings.rest_enabled) {
      const r = ex.rest_seconds ?? settings.rest_seconds_default ?? 90
      if (r > 0) startRest(r, activeIdx, setIdx)
    }
    // Auto-advance to next incomplete set
    const next = nextIncompleteSet(ex.sets, setIdx)
    if (next !== -1) setActiveSetIdx(next)
  }

  const handleRemoveSet = (setIdx: number) => {
    removeSet(activeIdx, setIdx)
    setActiveSetIdx(Math.max(0, Math.min(setIdx, ex.sets.length - 2)))
  }

  const handleRemoveExercise = () => {
    removeExercise(activeIdx)
    const newLen = session.exercises.length - 1
    if (newLen === 0) { setPhase('overview'); return }
    onSetActiveIdx(Math.min(activeIdx, newLen - 1))
  }

  if (!set) return null

  // Rest-timer view state for this exercise (restExIdx/restSetIdx are cleared or
  // remapped by the store on structural edits, so they're safe to key on here).
  const restingHere = restExIdx === activeIdx
  // The set the rest is "before" — the one auto-advance focuses. We only collapse the
  // Complete Set control for THAT set, so navigating to a different set stays loggable.
  const restNextSet = restingHere && restSetIdx != null ? nextIncompleteSet(ex.sets, restSetIdx) : -1
  const hideCompleteForRest = restingHere && clampedSetIdx === restNextSet

  return (
    <div className="fixed inset-0 z-[60] bg-surface-base flex flex-col">
      <TopBar s={session} onBack={() => setPhase('exercise-info')} />

      {/* Exercise name + muscle (compact) */}
      <div className="px-5 pt-4 pb-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-lg text-tx-primary leading-tight truncate">{ex.exercise.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${muscleColor(ex.exercise.muscle_group)}`}>
                {ex.exercise.muscle_group}
              </span>
              <span className="text-xs text-tx-muted tabular-nums">{completedHere}/{ex.sets.length} sets done</span>
            </div>
          </div>
          {!allSetsComplete && (
            <button onClick={handleRemoveExercise} aria-label="Remove this exercise" title="Remove exercise" className="p-1.5 hover:bg-error-500/10 rounded-lg transition-colors flex-shrink-0">
              <Trash2 className="w-4 h-4 text-tx-muted hover:text-error-400 transition-colors" />
            </button>
          )}
        </div>
        <div className="mt-2">
          <ExerciseNotes exIdx={activeIdx} notes={ex.notes} onSave={updateExerciseNotes} />
        </div>
      </div>

      {/* The whole logging group (set chips, target, inputs, action). Scrollable +
          min-h-0 so when the rest timer docks below and compresses this area the
          content scrolls instead of clipping; m-auto keeps it centred when it fits. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* m-auto (not justify-center): centres the group when it fits, and when the
            docked rest panel leaves too little room (short phones) the auto margins
            collapse and the group scrolls with EVERYTHING reachable — margin-auto is
            scroll-stable where flex justify-center fights the scroll. No hardcoded
            heights. Spacing tightens while resting; roomy otherwise. */}
        <div className={`m-auto w-full flex flex-col items-center px-5 ${restingHere ? 'gap-4 py-2' : 'gap-6 py-4'}`}>
        {/* Set selector — one chip per set: active filled, done shows a check.
            Progress + navigation in one place (replaced the old dots + big number). */}
        <div className="flex items-center justify-center flex-wrap gap-2">
          {ex.sets.map((s, i) => {
            // Set ↔ timer linkage: while resting, the chip of the set that started
            // the timer keeps a subtle brand ring so it reads as "resting after
            // this one" even though focus auto-advanced to the next set.
            const resting = restingHere && restSetIdx === i
            return (
              <button
                key={i}
                onClick={() => setActiveSetIdx(i)}
                aria-label={`Set ${i + 1}${s.completed ? ', done' : ''}${resting ? ', resting' : ''}`}
                aria-current={i === clampedSetIdx}
                className={`flex items-center justify-center gap-1 min-w-[2.75rem] h-10 px-3 rounded-full text-sm font-bold tabular-nums transition-all active:scale-95 ${
                  i === clampedSetIdx ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' :
                  s.completed ? `bg-brand-500/15 text-brand-400${resting ? ' ring-1 ring-brand-500/60' : ''}` :
                  'bg-surface-muted text-tx-muted hover:text-tx-secondary'
                }`}
              >
                {s.completed && <Check className="w-3.5 h-3.5" />}
                {i + 1}
              </button>
            )
          })}
        </div>

        {/* Target reference for this set (the goal to hit) */}
        {(set.target_reps > 0 || set.target_weight > 0) && (
          <p className="text-sm text-tx-muted text-center">
            Target{' '}
            <span className="font-semibold text-tx-secondary tabular-nums">{set.target_reps > 0 ? set.target_reps : '—'} reps</span>
            {set.target_weight > 0 && (
              <> · <span className="font-semibold text-tx-secondary tabular-nums">{displayWeight(set.target_weight, wUnit)} {wUnit}</span></>
            )}
          </p>
        )}

        {/* Reps + Weight — a tile per metric: icon header, big value, split ⊖/⊕ footer.
            Value spans the full tile (buttons are below, not flanking) so long
            weights never clip. */}
        <div className="w-full grid grid-cols-2 gap-3">
          {/* Reps — key by set so a half-typed value can't bleed to the next set */}
          <StepperTile
            icon={Repeat} label="Reps" name="reps" step={1} disabled={set.completed}
            onStep={d => updateSet(activeIdx, clampedSetIdx, 'actual_reps', clampStep(set.actual_reps || 0, d, { min: 0 }))}
          >
            <NumberField
              key={`reps-${activeIdx}-${clampedSetIdx}`}
              inputMode="numeric"
              value={set.actual_reps ? String(set.actual_reps) : ''}
              onChange={v => updateSet(activeIdx, clampedSetIdx, 'actual_reps', Math.round(clampValue(v)))}
              placeholder={set.target_reps > 0 ? String(set.target_reps) : '0'}
              disabled={set.completed}
              aria-label="Reps"
            />
          </StepperTile>

          {/* Weight */}
          <StepperTile
            icon={Dumbbell} label={`Weight (${wUnit})`} name="weight" step={2.5} disabled={set.completed}
            onStep={d => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampStep(displayWeight(set.actual_weight, wUnit), d, { min: 0 }), wUnit))}
          >
            <NumberField
              key={`wt-${activeIdx}-${clampedSetIdx}`}
              inputMode="decimal"
              value={set.actual_weight ? String(displayWeight(set.actual_weight, wUnit)) : ''}
              onChange={v => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampValue(v), wUnit))}
              placeholder={set.target_weight > 0 ? String(displayWeight(set.target_weight, wUnit)) : '0'}
              disabled={set.completed}
              aria-label="Weight"
            />
          </StepperTile>
        </div>

        {/* While resting before this set, collapse + fade the Complete Set / Remove
            controls out of the way — you Skip the timer to begin it. This also frees
            the space so the set content never clips behind the docked rest panel.
            Keyed on the specific up-next set (not the whole exercise) so navigating to
            another set to log it still shows its Complete button. */}
        <div className={`w-full flex flex-col items-center gap-6 overflow-hidden transition-all duration-300 ${
          hideCompleteForRest ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-40 opacity-100'
        }`}>
          {/* Complete button */}
          <button
            onClick={() => handleCompleteSetGym(clampedSetIdx)}
            className={`w-full py-5 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all ${
              set.completed
                ? 'bg-brand-500/15 border-2 border-brand-500/40 text-brand-400'
                : 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/30'
            }`}
          >
            <CheckCircle2 className="w-6 h-6" />
            {set.completed ? 'Completed' : 'Complete Set'}
          </button>

          {/* Remove set — hidden on the last set (removing it would empty the exercise
              and drop to a blank screen; use the header trash to remove the exercise) */}
          {ex.sets.length > 1 && (
            <button
              onClick={() => handleRemoveSet(clampedSetIdx)}
              className="text-xs text-tx-muted/50 hover:text-error-400 transition-colors"
            >
              Remove this set
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="px-5 pb-6 pt-3 border-t border-surface-border flex-shrink-0 space-y-2">
        {/* Set prev/next + add */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSetIdx(clampedSetIdx - 1)}
            disabled={clampedSetIdx === 0}
            className="p-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 border border-surface-border text-tx-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => { addSet(activeIdx); setActiveSetIdx(ex.sets.length) }}
            className="flex-1 py-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border hover:border-brand-500/40 hover:bg-brand-500/5 text-xs font-medium text-tx-muted hover:text-brand-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Set
          </button>
          <button
            onClick={() => setActiveSetIdx(clampedSetIdx + 1)}
            disabled={clampedSetIdx >= ex.sets.length - 1}
            className="p-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 border border-surface-border text-tx-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Exercise prev/next */}
        <div className="flex gap-2">
          <button
            onClick={() => setPhase('exercise-info')}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 border border-surface-border text-tx-secondary text-sm font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Info
          </button>
          {isLast ? (
            <button
              onClick={() => setConfirmFinish(true)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                allSetsComplete
                  ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30'
              }`}
            >
              <Flag className="w-4 h-4" />
              Finish Workout
            </button>
          ) : (
            <button
              onClick={() => setGymState('exercise-info', activeIdx + 1, 0)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                allSetsComplete
                  ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary border border-surface-border'
              }`}
            >
              Next Exercise
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Rest timer — docked here (in-flow, last child) so it pushes the set
          content up instead of covering it. Renders null when no rest is active. */}
      <RestTimerBanner docked />

      {/* ── Finish confirm ── */}
      {confirmFinish && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Finish Workout?</h3>
            <p className="text-sm text-tx-muted mb-5">{completedSets} of {totalSets} sets completed. Workout will be saved.</p>
            {saveError && <p className="text-xs text-error-400 mb-3">{saveError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirmFinish(false)} disabled={saving} className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 disabled:opacity-50 text-tx-secondary rounded-xl transition-colors font-medium text-sm">
                Keep Going
              </button>
              <button onClick={handleFinish} disabled={saving} className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5">
                <Flag className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Finish'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Cancel confirm ── */}
      <DiscardConfirm open={confirmCancel} onKeep={() => setConfirmCancel(false)} onDiscard={() => { cancelSession(); handleMinimize() }} />
    </div>
  )
}
