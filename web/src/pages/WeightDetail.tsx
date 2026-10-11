import { ConfirmSheet } from '../components/ui'
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Scale, Trash2, Edit2, Save, X, AlertCircle, Loader } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, displayWeight, weightError, maxWeight, resolveWeightLbs } from '../stores/settings'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useAsyncAction, uiMessage, isNotFound, todayStr, dayToInstant, entryDay, BODYWEIGHT_STEP, clampStep, types, formatDay, useTranslation, Trans, type UiMessage } from '@lyftr/shared'
import { ErrorState } from '../components/ui'
import StepperTile from '../components/ui/StepperTile'
import NumberField from '../components/ui/NumberField'

export default function WeightDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  const [log, setLog] = useState<types.WeightLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<UiMessage | null>(null)
  const [gone, setGone] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editWeight, setEditWeight] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  // The value the box was rejected for, not the sentence, so the banner follows a language switch.
  const [badWeight, setBadWeight] = useState<number | null>(null)

  // Delete confirm
  const [confirming, setConfirming] = useState(false)

  useEscapeKey(editing, () => { setEditing(false); setBadWeight(null) })

  useEffect(() => {
    weightAPI.get(Number(id))
      .then(setLog)
      .catch(err => {
        setGone(isNotFound(err))
        setError({ key: 'errors.unknown', cause: err })
      })
      .finally(() => setLoading(false))
  }, [id, retryKey])

  const startEdit = () => {
    if (!log) return
    setEditWeight(String(displayWeight(log.weight, settings.weight_unit)))
    setEditDate(entryDay(log))
    setEditNotes(log.notes ?? '')
    setBadWeight(null)
    setEditing(true)
  }

  const saveEdit = useAsyncAction(async (entry: types.WeightLog) => {
    const updated = await weightAPI.update(entry.id, {
      weight: resolveWeightLbs(editWeight, entry.weight, settings.weight_unit),
      notes: editNotes.trim(),
      logged_at: dayToInstant(editDate, entry.logged_at),
    })
    setLog(updated)
    setEditing(false)
  }, t('common.saveFailed'))

  // `badWeight` is what this page can say about the value in the box; the hook carries
  // what the server said. The entry is passed to run() because the guard below is what
  // proves it is not null.
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!log || saveEdit.busy) return
    const w = parseFloat(editWeight)
    const wErr = weightError(w, settings.weight_unit)
    if (wErr) {
      setBadWeight(w)
      return
    }
    setBadWeight(null)
    void saveEdit.run(log)
  }

  // Was a bare `catch` that closed the confirm and left the entry there — the same
  // silent failure as every other delete in the app before this branch.
  const remove = useAsyncAction(async (entry: types.WeightLog) => {
    await weightAPI.delete(entry.id)
    navigate('/weight', { replace: true })
  }, t('weight.deleteFailed'))

  const editError = badWeight == null ? '' : weightError(badWeight, settings.weight_unit) ?? ''

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error || !log) {
    return (
      <ErrorState
        size="page"
        title={t('weight.detail.loadFailed')}
        message={error ? uiMessage(error) : t('weight.detail.gone')}
        onRetry={error && !gone ? () => { setError(null); setRetryKey(k => k + 1) } : undefined}
        secondary={<Link to="/weight" className="btn-secondary btn-sm">{t('weight.detail.backToWeight')}</Link>}
      />
    )
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      {/* Back nav + actions */}
      <div className="flex items-center justify-between">
        <Link to="/weight" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('weight.detail.back')}
        </Link>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={startEdit}
              className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
              aria-label={t('weight.detail.editLabel')}
            >
              <Edit2 className="w-4 h-4 text-brand-500" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="p-2 hover:bg-error-500/10 rounded-lg transition-colors"
              aria-label={t('weight.detail.deleteLabel')}
            >
              <Trash2 className="w-4 h-4 text-error-400" />
            </button>
          </div>
        )}
      </div>

      {/* Hero card */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Scale className="w-7 h-7 text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="stat-label mb-1">{t('weight.detail.entryLabel')}</p>
            {editing ? (
              <p className="text-sm text-brand-400 font-medium">{t('weight.detail.editing')}</p>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <span className="stat-value text-5xl tabular-nums">{displayWeight(log.weight, settings.weight_unit)}</span>
                  <span className="text-tx-muted text-lg mb-1">{wUnit}</span>
                </div>
                <p className="text-sm text-tx-muted mt-1">
                  {formatDay(entryDay(log), 'weekdayDate')}
                </p>
                {log.notes && (
                  <p className="text-sm text-tx-secondary mt-2 italic">"{log.notes}"</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="card p-5">
          <h2 className="section-title mb-4">{t('weight.detail.editTitle')}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            {(editError || saveEdit.error) && (
              <div className="alert-error" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError || saveEdit.error}</span>
              </div>
            )}

            <StepperTile
              icon={Scale}
              label={t('common.weightWithUnit', { unit: wUnit })}
              name={t('common.weightName')}
              step={BODYWEIGHT_STEP}
              onStep={d => setEditWeight(String(clampStep(parseFloat(editWeight) || 0, d, { max: maxWeight(settings.weight_unit) })))}
            >
              <NumberField value={editWeight} onChange={setEditWeight} aria-label={t('weight.log.weightField')} />
            </StepperTile>

            <div>
              <label className="label">{t('weight.detail.date')}</label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                max={todayStr()}
                className="input mt-1"
              />
            </div>

            <div>
              <label className="label">
                <Trans i18nKey="weight.detail.notesOptional" components={{ hint: <span className="text-tx-muted font-normal" /> }} />
              </label>
              <input
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder={t('weight.notePlaceholder')}
                maxLength={200}
                className="input mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setEditing(false); setBadWeight(null) }}
                className="flex-1 py-2.5 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" /> {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!(parseFloat(editWeight) > 0) || saveEdit.busy}
                className="flex-1 btn-primary py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saveEdit.busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirm — bottom sheet */}
      <ConfirmSheet
        open={confirming}
        icon={Trash2}
        destructive
        title={t('weight.deleteTitle')}
        message={t('common.deleteConfirmMessage', { subject: t('weight.deleteSubject', { date: formatDay(entryDay(log), 'longDate'), weight: displayWeight(log.weight, settings.weight_unit), unit: wUnit }) })}
        confirmLabel={t('common.delete')}
        busyLabel={t('common.deleting')}
        busy={remove.busy}
        error={remove.error}
        onConfirm={() => { if (!remove.busy) void remove.run(log) }}
        onCancel={() => { setConfirming(false); remove.reset() }}
      />
    </div>
  )
}
