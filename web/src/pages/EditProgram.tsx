import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle, BookOpen, FileText, Dumbbell, CalendarDays } from 'lucide-react'
import { programAPI } from '../services/api'
import { useSettingsStore, weightShort, lbsToDisplay, displayToLbs } from '../stores/settings'
import ProgramDaysEditor from '../components/programs/ProgramDaysEditor'
import * as types from '../types'
import type { DayDraft } from '../components/programs/types'

interface ProgramFormData {
  name: string
  notes: string
  days: DayDraft[]
}

export default function EditProgram() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerExercises, setPickerExercises] = useState<Record<number, types.Exercise>>({})
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', days: [] })

  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])

  useEffect(() => {
    const programId = Number(id)
    if (!programId) { navigate('/programs'); return }
    programAPI.get(programId)
      .then(p => {
        const map: Record<number, types.Exercise> = {}
        ;(p.days || []).forEach(d => (d.exercises || []).forEach(ex => { map[ex.exercise_id] = ex.exercise }))
        setPickerExercises(map)
        setFormData({
          name: p.name,
          notes: p.notes || '',
          days: (p.days || []).map((d, i) => ({
            id: d.id,
            order_index: d.order_index ?? i,
            is_rest_day: d.is_rest_day,
            name: d.name || '',
            exercises: (d.exercises || []).map(ex => ({
              exercise_id: ex.exercise_id,
              notes: ex.notes || '',
              rest_seconds: ex.rest_seconds ?? (settings.rest_seconds_default ?? 90),
              sets: (ex.sets || []).map(s => ({
                set_number: s.set_number,
                target_reps: s.target_reps,
                target_weight: lbsToDisplay(s.target_weight, settings.weight_unit),
              })),
            })),
          })),
        })
      })
      .catch(() => { setError('Failed to load program'); })
      .finally(() => setInitialLoading(false))
  }, [id])

  const cacheExercise = (ex: types.Exercise) => setPickerExercises(prev => ({ ...prev, [ex.id]: ex }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError('Program name required'); return }
    if (formData.days.length === 0) { setError('Add at least one day'); return }
    const hasAnyExercise = formData.days.some(d => !d.is_rest_day && d.exercises.length > 0)
    if (!hasAnyExercise) { setError('Add at least one exercise to a workout day'); return }
    setLoading(true)
    try {
      const payload = {
        name: formData.name,
        notes: formData.notes,
        // Declares this client round-trips day ids: without it, deleting every
        // existing day and adding only new (id-less) ones is indistinguishable
        // from a legacy payload and the server would positionally re-attribute
        // the deleted days' workout history to the new days.
        day_ids_known: true,
        days: formData.days.map(d => ({
          ...d,
          exercises: d.exercises.map(ex => ({
            ...ex,
            sets: ex.sets.map(s => ({ ...s, target_weight: displayToLbs(s.target_weight, settings.weight_unit) })),
          })),
        })),
      }
      await programAPI.update(Number(id), payload)
      navigate('/programs')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update program')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Dumbbell className="w-6 h-6 text-brand-500 animate-pulse" />
      </div>
    )
  }

  const totalExercises = formData.days.reduce((s, d) => s + d.exercises.length, 0)
  const totalSets = formData.days.reduce((s, d) => s + d.exercises.reduce((s2, ex) => s2 + ex.sets.length, 0), 0)

  return (
    <div className="space-y-6 animate-slide-up pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Edit Program</h1>
          <p className="text-xs text-tx-muted">{formData.days.length} days • {totalExercises} exercises • {totalSets} sets</p>
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
          </div>
          <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="input mt-1" />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-brand-500" />
            <label className="label">Notes</label>
          </div>
          <textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} className="input mt-1 min-h-16 resize-none" />
        </div>

        {formData.days.length > 0 && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{formData.days.length}</div>
              <div className="text-xs text-tx-muted">Days</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{totalExercises}</div>
              <div className="text-xs text-tx-muted">Exercises</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{totalSets}</div>
              <div className="text-xs text-tx-muted">Target Sets</div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-brand-500" />
            <label className="label">Days</label>
            <span className="text-xs text-tx-muted">(repeats in this order)</span>
          </div>
          <ProgramDaysEditor
            days={formData.days}
            onChange={days => setFormData(prev => ({ ...prev, days }))}
            pickerExercises={pickerExercises}
            onCacheExercise={cacheExercise}
            wUnit={wUnit}
            restSecondsDefault={settings.rest_seconds_default ?? 90}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 px-4 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
