import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, BookOpen, FileText, CalendarDays } from 'lucide-react'
import { programAPI } from '../services/api'
import { useSettingsStore, weightShort, displayToLbs } from '../stores/settings'
import { useAsyncAction, hasWorkoutExercises, types, uiMessage, useTranslation, type UiMessage } from '@lyftr/shared'
import ProgramDaysEditor from '../components/programs/ProgramDaysEditor'
import type { DayDraft } from '../components/programs/types'

interface ProgramFormData {
  name: string
  notes: string
  days: DayDraft[]
}

export default function AddProgram() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  // `error` is for what the FORM can tell the user before anything is sent (a missing
  // name, an empty day). What the SERVER says lives on the hook below — different
  // questions, kept apart on purpose, and rendered in the same place.
  const [error, setError] = useState<UiMessage | null>(null)
  const [pickerExercises, setPickerExercises] = useState<Record<number, types.Exercise>>({})
  const [formData, setFormData] = useState<ProgramFormData>({ name: '', notes: '', days: [] })


  const cacheExercise = (ex: types.Exercise) => setPickerExercises(prev => ({ ...prev, [ex.id]: ex }))

  const save = useAsyncAction(async () => {
    const payload = {
      name: formData.name,
      notes: formData.notes,
      days: formData.days.map(d => ({
        ...d,
        exercises: d.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(s => ({ ...s, target_weight: displayToLbs(s.target_weight, settings.weight_unit) })),
        })),
      })),
    }
    await programAPI.create(payload)
    navigate('/programs')
  }, t('programs.form.createFailed'))

  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])
  useEffect(() => { if (save.failureKey) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [save.failureKey])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError({ key: 'programs.form.errors.nameRequired' }); return }
    if (formData.days.length === 0) { setError({ key: 'programs.form.errors.noDays' }); return }
    const hasAnyExercise = hasWorkoutExercises(formData.days)
    if (!hasAnyExercise) { setError({ key: 'programs.form.errors.noExercises' }); return }
    setError(null)
    void save.run()
  }

  const totalExercises = formData.days.reduce((s, d) => s + d.exercises.length, 0)
  const totalSets = formData.days.reduce((s, d) => s + d.exercises.reduce((s2, ex) => s2 + ex.sets.length, 0), 0)

  return (
    <div className="space-y-6 animate-slide-up pb-10">
      <div className="flex items-center gap-3">
        <button aria-label={t('common.goBack')} onClick={() => navigate(-1)} className="p-2 hover:bg-surface-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">{t('programs.form.newTitle')}</h1>
          <p className="text-xs text-tx-muted">
            {t('programs.form.summary', { days: t('common.count.days', { count: formData.days.length }), exercises: t('common.count.exercises', { count: totalExercises }), sets: t('common.count.sets', { count: totalSets }) })}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {(error || save.error) && (
          <div className="alert-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error ? uiMessage(error) : save.error}</span>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-brand-500" />
            <label className="label">{t('programs.form.name')}</label>
            <span className="text-xs text-tx-muted">{t('common.required')}</span>
          </div>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('programs.form.namePlaceholder')}
            className="input mt-1"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-brand-500" />
            <label className="label">{t('common.notes')}</label>
          </div>
          <textarea
            value={formData.notes}
            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder={t('programs.form.notesPlaceholder')}
            className="input mt-1 min-h-16 resize-none"
          />
        </div>

        {formData.days.length > 0 && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{formData.days.length}</div>
              <div className="text-xs text-tx-muted">{t('programs.form.days')}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{totalExercises}</div>
              <div className="text-xs text-tx-muted">{t('workouts.form.exercises')}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-brand-500">{totalSets}</div>
              <div className="text-xs text-tx-muted">{t('programs.form.targetSets')}</div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-brand-500" />
            <label className="label">{t('programs.form.days')}</label>
            <span className="text-xs text-tx-muted">{t('programs.form.daysHintNew')}</span>
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
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={save.busy} className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />
            {save.busy ? t('common.saving') : t('programs.form.saveProgram')}
          </button>
        </div>
      </form>
    </div>
  )
}
