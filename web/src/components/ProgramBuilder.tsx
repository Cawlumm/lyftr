import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Trash2, AlertCircle, BookOpen, FileText, Zap, Timer, Coffee, ChevronUp, ChevronDown } from 'lucide-react'
import { useSettingsStore, weightShort, displayToLbs } from '../stores/settings'
import WeightInput from './WeightInput'
import ExercisePicker from './ExercisePicker'
import RestPicker from './RestPicker'
import * as types from '../types'

export interface BuilderSet { set_number: number; target_reps: number; target_weight: number }
export interface BuilderExercise {
  clientId: string
  exercise_id: number
  exercise: types.Exercise
  notes: string
  rest_seconds: number
  sets: BuilderSet[]
}
export interface BuilderDay {
  clientId: string
  name: string
  is_rest_day: boolean
  exercises: BuilderExercise[]
}
export interface BuilderInitial {
  name: string
  notes: string
  days: BuilderDay[]
}

// Monotonic client id for stable React keys across reorders. A counter (not the array
// index) so moving a day up/down doesn't scramble input focus or controlled values.
let clientSeq = 0
export const newClientId = () => `cb${++clientSeq}`

export function emptyTrainingDay(name: string): BuilderDay {
  return { clientId: newClientId(), name, is_rest_day: false, exercises: [] }
}

const MAX_DAYS = 14

interface Props {
  heading: string
  submitLabel: string
  initial: BuilderInitial
  onSubmit: (payload: any) => Promise<void>
}

export default function ProgramBuilder({ heading, submitLabel, initial, onSubmit }: Props) {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [name, setName] = useState(initial.name)
  const [notes, setNotes] = useState(initial.notes)
  const [days, setDays] = useState<BuilderDay[]>(initial.days)
  const [pickerDay, setPickerDay] = useState<string | null>(null) // clientId of day whose picker is open
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])

  // A single day collapses the day chrome so a simple routine feels like a flat builder.
  const collapsed = days.length <= 1
  const defaultRest = settings.rest_seconds_default ?? 90

  const updateDay = (dayIdx: number, fn: (d: BuilderDay) => BuilderDay) => {
    setDays(prev => prev.map((d, i) => (i === dayIdx ? fn(d) : d)))
  }

  const addTrainingDay = () => {
    if (days.length >= MAX_DAYS) { setError(`A program can have at most ${MAX_DAYS} days`); return }
    setDays(prev => [...prev, emptyTrainingDay(`Day ${prev.length + 1}`)])
    setError('')
  }

  const addRestDay = () => {
    if (days.length >= MAX_DAYS) { setError(`A program can have at most ${MAX_DAYS} days`); return }
    setDays(prev => [...prev, { clientId: newClientId(), name: 'Rest', is_rest_day: true, exercises: [] }])
    setError('')
  }

  const deleteDay = (dayIdx: number) => setDays(prev => prev.filter((_, i) => i !== dayIdx))

  const moveDay = (dayIdx: number, dir: -1 | 1) => {
    setDays(prev => {
      const next = [...prev]
      const target = dayIdx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[dayIdx], next[target]] = [next[target], next[dayIdx]]
      return next
    })
  }

  // Rest toggle HIDES exercises (retains them in state) rather than clearing, so
  // toggling rest on then off doesn't lose the user's work. Exercises are stripped
  // from the submit payload for rest days.
  const toggleRest = (dayIdx: number) => updateDay(dayIdx, d => ({ ...d, is_rest_day: !d.is_rest_day }))
  const setDayName = (dayIdx: number, value: string) => updateDay(dayIdx, d => ({ ...d, name: value }))

  const addExercise = (dayIdx: number, exercise: types.Exercise) => {
    updateDay(dayIdx, d => ({
      ...d,
      exercises: [...d.exercises, {
        clientId: newClientId(),
        exercise_id: exercise.id,
        exercise,
        notes: '',
        rest_seconds: defaultRest,
        sets: [{ set_number: 1, target_reps: 0, target_weight: 0 }],
      }],
    }))
    setPickerDay(null)
    setError('')
  }

  const removeExercise = (dayIdx: number, exIdx: number) =>
    updateDay(dayIdx, d => ({ ...d, exercises: d.exercises.filter((_, i) => i !== exIdx) }))

  const setExNotes = (dayIdx: number, exIdx: number, value: string) =>
    updateDay(dayIdx, d => ({ ...d, exercises: d.exercises.map((ex, i) => i === exIdx ? { ...ex, notes: value } : ex) }))

  const setExRest = (dayIdx: number, exIdx: number, secs: number) =>
    updateDay(dayIdx, d => ({ ...d, exercises: d.exercises.map((ex, i) => i === exIdx ? { ...ex, rest_seconds: secs } : ex) }))

  const addSet = (dayIdx: number, exIdx: number) =>
    updateDay(dayIdx, d => ({
      ...d,
      exercises: d.exercises.map((ex, i) => i === exIdx
        ? { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, target_reps: 0, target_weight: 0 }] }
        : ex),
    }))

  const removeSet = (dayIdx: number, exIdx: number, setIdx: number) =>
    updateDay(dayIdx, d => ({
      ...d,
      exercises: d.exercises.map((ex, i) => i === exIdx
        ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
        : ex),
    }))

  const updateSet = (dayIdx: number, exIdx: number, setIdx: number, field: 'target_reps' | 'target_weight', value: any) =>
    updateDay(dayIdx, d => ({
      ...d,
      exercises: d.exercises.map((ex, i) => i === exIdx
        ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: Number(value) || 0 } : s) }
        : ex),
    }))

  const trainingCount = days.filter(d => !d.is_rest_day).length
  const totalExercises = days.reduce((sum, d) => sum + (d.is_rest_day ? 0 : d.exercises.length), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Program name required'); return }
    if (days.length > MAX_DAYS) { setError(`A program can have at most ${MAX_DAYS} days`); return }
    if (trainingCount === 0) { setError('Add at least one training day'); return }
    setLoading(true)
    try {
      const payload = {
        name,
        notes,
        days: days.map((d, i) => ({
          name: d.name.trim() || `Day ${i + 1}`,
          is_rest_day: d.is_rest_day,
          exercises: d.is_rest_day ? [] : d.exercises.map(ex => ({
            exercise_id: ex.exercise_id,
            notes: ex.notes,
            rest_seconds: ex.rest_seconds,
            sets: ex.sets.map(s => ({ ...s, target_weight: displayToLbs(s.target_weight, settings.weight_unit) })),
          })),
        })),
      }
      await onSubmit(payload)
      navigate('/programs')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save program')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-slide-up pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">{heading}</h1>
          <p className="text-xs text-tx-muted">
            {collapsed ? `${totalExercises} exercises` : `${trainingCount} training days • ${totalExercises} exercises`}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="alert-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-brand-500" />
            <label className="label">Program Name</label>
            <span className="text-xs text-tx-muted">(required)</span>
          </div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Push Pull Legs, Upper Lower"
            className="input mt-1"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-brand-500" />
            <label className="label">Notes</label>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Program description or goals…"
            className="input mt-1 min-h-16 resize-none"
          />
        </div>

        <div className="space-y-4">
          {days.map((day, dayIdx) => (
            <DaySection
              key={day.clientId}
              day={day}
              dayIdx={dayIdx}
              dayCount={days.length}
              collapsed={collapsed}
              wUnit={wUnit}
              pickerOpen={pickerDay === day.clientId}
              onOpenPicker={() => setPickerDay(day.clientId)}
              onClosePicker={() => setPickerDay(null)}
              onAddExercise={addExercise}
              onRemoveExercise={removeExercise}
              onSetExNotes={setExNotes}
              onSetExRest={setExRest}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onUpdateSet={updateSet}
              onSetDayName={setDayName}
              onToggleRest={toggleRest}
              onMoveDay={moveDay}
              onDeleteDay={deleteDay}
            />
          ))}
        </div>

        {/* Day controls */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addTrainingDay}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Add Day
          </button>
          <button
            type="button"
            onClick={addRestDay}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium border border-surface-border"
          >
            <Coffee className="w-3.5 h-3.5" /> Add Rest Day
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 px-4 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />
            {loading ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

interface DaySectionProps {
  day: BuilderDay
  dayIdx: number
  dayCount: number
  collapsed: boolean
  wUnit: string
  pickerOpen: boolean
  onOpenPicker: () => void
  onClosePicker: () => void
  onAddExercise: (dayIdx: number, ex: types.Exercise) => void
  onRemoveExercise: (dayIdx: number, exIdx: number) => void
  onSetExNotes: (dayIdx: number, exIdx: number, value: string) => void
  onSetExRest: (dayIdx: number, exIdx: number, secs: number) => void
  onAddSet: (dayIdx: number, exIdx: number) => void
  onRemoveSet: (dayIdx: number, exIdx: number, setIdx: number) => void
  onUpdateSet: (dayIdx: number, exIdx: number, setIdx: number, field: 'target_reps' | 'target_weight', value: any) => void
  onSetDayName: (dayIdx: number, value: string) => void
  onToggleRest: (dayIdx: number) => void
  onMoveDay: (dayIdx: number, dir: -1 | 1) => void
  onDeleteDay: (dayIdx: number) => void
}

function DaySection(props: DaySectionProps) {
  const { day, dayIdx, dayCount, collapsed, wUnit, pickerOpen } = props
  const selectedIds = day.exercises.map(e => e.exercise_id)

  return (
    <div className="rounded-xl border border-surface-border bg-surface-base/40">
      {/* Day header — hidden when the program has a single day (flat-builder feel) */}
      {!collapsed && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-border">
          <div className="flex flex-col">
            <button type="button" disabled={dayIdx === 0} onClick={() => props.onMoveDay(dayIdx, -1)} className="p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-30">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button type="button" disabled={dayIdx === dayCount - 1} onClick={() => props.onMoveDay(dayIdx, 1)} className="p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-30">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={day.name}
            onChange={e => props.onSetDayName(dayIdx, e.target.value)}
            placeholder={`Day ${dayIdx + 1}`}
            className="input text-sm flex-1 py-1.5"
          />
          <button
            type="button"
            onClick={() => props.onToggleRest(dayIdx)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${day.is_rest_day ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-surface-muted border-surface-border text-tx-muted hover:text-tx-secondary'}`}
          >
            <Coffee className="w-3.5 h-3.5" /> Rest
          </button>
          <button type="button" onClick={() => props.onDeleteDay(dayIdx)} className="p-1.5 hover:bg-error-500/20 rounded transition-colors">
            <Trash2 className="w-4 h-4 text-error-400" />
          </button>
        </div>
      )}

      {day.is_rest_day ? (
        <div className="px-4 py-6 text-center text-sm text-tx-muted">
          <Coffee className="w-5 h-5 mx-auto mb-1 opacity-60" />
          Rest day — no exercises
        </div>
      ) : (
        <div className="p-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-500" />
              <label className="label">Exercises</label>
            </div>
            <button
              type="button"
              onClick={props.onOpenPicker}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Exercise
            </button>
          </div>

          {pickerOpen && (
            <ExercisePicker
              selectedIds={selectedIds}
              onSelect={ex => props.onAddExercise(dayIdx, ex)}
              onClose={props.onClosePicker}
            />
          )}

          {day.exercises.map((ex, exIdx) => (
            <div key={ex.clientId} className="p-4 bg-surface-muted/30 border border-surface-border rounded-lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-brand-500">{exIdx + 1}</span>
                    </div>
                    <p className="font-semibold text-tx-primary">{ex.exercise?.name}</p>
                  </div>
                  <p className="text-xs text-tx-muted ml-8">{ex.exercise?.muscle_group} • {ex.exercise?.equipment}</p>
                </div>
                <button type="button" onClick={() => props.onRemoveExercise(dayIdx, exIdx)} className="p-1.5 hover:bg-error-500/20 rounded transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4 text-error-400" />
                </button>
              </div>

              <div className="mb-4">
                <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Notes</label>
                <input
                  type="text"
                  value={ex.notes}
                  onChange={e => props.onSetExNotes(dayIdx, exIdx, e.target.value)}
                  placeholder="e.g., Focus on controlled eccentric"
                  className="input text-sm"
                />
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Timer className="w-3.5 h-3.5 text-brand-500" />
                  <label className="text-xs text-tx-muted font-medium uppercase tracking-wider">Rest between sets</label>
                </div>
                <RestPicker value={ex.rest_seconds ?? 90} onChange={secs => props.onSetExRest(dayIdx, exIdx, secs)} />
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-tx-muted font-medium uppercase tracking-wider">Target Sets</label>
                  <span className="text-xs text-tx-muted">{ex.sets.length} sets</span>
                </div>
                {ex.sets.map((set, setIdx) => (
                  <div key={setIdx} className="flex gap-2 items-end bg-surface-raised/40 p-3 rounded-lg border border-surface-border/50">
                    <div className="flex-shrink-0 w-12">
                      <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block">Set</label>
                      <div className="text-sm font-bold text-tx-primary bg-surface-muted px-2 py-1 rounded text-center">{set.set_number}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Target Reps</label>
                      <input type="number" inputMode="numeric" value={set.target_reps || ''} onChange={e => props.onUpdateSet(dayIdx, exIdx, setIdx, 'target_reps', e.target.value)} placeholder="10" className="input text-sm w-full" min="0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-xs text-tx-muted font-medium uppercase tracking-wider block mb-1">Target Weight</label>
                      <WeightInput stepper={false} size="sm" value={set.target_weight ? String(set.target_weight) : ''} onChange={v => props.onUpdateSet(dayIdx, exIdx, setIdx, 'target_weight', v)} unit={wUnit} placeholder="135" />
                    </div>
                    <button type="button" onClick={() => props.onRemoveSet(dayIdx, exIdx, setIdx)} className="p-2 hover:bg-error-500/20 rounded transition-colors flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-error-400" />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => props.onAddSet(dayIdx, exIdx)} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Set
              </button>
            </div>
          ))}

          {day.exercises.length === 0 && (
            <p className="text-xs text-tx-muted text-center py-3">No exercises yet — add one to build this day.</p>
          )}
        </div>
      )}
    </div>
  )
}
