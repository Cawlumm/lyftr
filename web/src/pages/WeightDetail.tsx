import { ConfirmSheet } from '../components/ui'
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Scale, Trash2, Edit2, Save, X, AlertCircle, Loader } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, displayWeight, weightError, maxWeight, resolveWeightLbs } from '../stores/settings'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useAsyncAction, apiErrorMessage, todayStr, dayToInstant, entryDay, dayToLocalDate, BODYWEIGHT_STEP, clampStep, types } from '@lyftr/shared'
import StepperTile from '../components/ui/StepperTile'
import NumberField from '../components/ui/NumberField'

export default function WeightDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  const [log, setLog] = useState<types.WeightLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editWeight, setEditWeight] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState('')

  // Delete confirm
  const [confirming, setConfirming] = useState(false)

  useBodyScrollLock(confirming)
  useEscapeKey(confirming, () => setConfirming(false))
  useEscapeKey(editing, () => { setEditing(false); setEditError('') })

  useEffect(() => {
    weightAPI.get(Number(id))
      .then(data => {
        setLog(data)
        setEditWeight(String(displayWeight(data.weight, settings.weight_unit)))
        setEditDate(entryDay(data))
        setEditNotes(data.notes ?? '')
      })
      .catch(err => setError(apiErrorMessage(err, 'Failed to load entry')))
      .finally(() => setLoading(false))
  }, [id])

  const startEdit = () => {
    if (!log) return
    setEditWeight(String(displayWeight(log.weight, settings.weight_unit)))
    setEditDate(entryDay(log))
    setEditNotes(log.notes ?? '')
    setEditError('')
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
  }, 'Failed to save')

  // `editError` is what this page can say about the value in the box; the hook carries
  // what the server said. The entry is passed to run() because the guard below is what
  // proves it is not null.
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!log || saveEdit.busy) return
    const w = parseFloat(editWeight)
    const wErr = weightError(w, settings.weight_unit)
    if (wErr) {
      setEditError(wErr)
      return
    }
    setEditError('')
    void saveEdit.run(log)
  }

  // Was a bare `catch` that closed the confirm and left the entry there — the same
  // silent failure as every other delete in the app before this branch.
  const remove = useAsyncAction(async (entry: types.WeightLog) => {
    await weightAPI.delete(entry.id)
    navigate('/weight', { replace: true })
  }, 'Failed to delete entry')

  const handleDelete = () => {
    if (!log || remove.busy) return
    void remove.run(log)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error || !log) {
    return (
      <div className="space-y-4">
        <Link to="/weight" className="flex items-center gap-2 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Weight
        </Link>
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || 'Entry not found'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      {/* Back nav + actions */}
      <div className="flex items-center justify-between">
        <Link to="/weight" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Weight
        </Link>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={startEdit}
              className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
              aria-label="Edit entry"
            >
              <Edit2 className="w-4 h-4 text-brand-500" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="p-2 hover:bg-error-500/10 rounded-lg transition-colors"
              aria-label="Delete entry"
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
            <p className="stat-label mb-1">Weight Entry</p>
            {editing ? (
              <p className="text-sm text-brand-400 font-medium">Editing…</p>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <span className="stat-value text-5xl tabular-nums">{displayWeight(log.weight, settings.weight_unit)}</span>
                  <span className="text-tx-muted text-lg mb-1">{wUnit}</span>
                </div>
                <p className="text-sm text-tx-muted mt-1">
                  {format(dayToLocalDate(entryDay(log)), 'EEEE, MMMM d, yyyy')}
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
          <h2 className="section-title mb-4">Edit Entry</h2>
          <form onSubmit={handleSave} className="space-y-4">
            {(editError || saveEdit.error) && (
              <div className="alert-error" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError || saveEdit.error}</span>
              </div>
            )}

            <StepperTile
              icon={Scale}
              label={`Weight (${wUnit})`}
              name="weight"
              step={BODYWEIGHT_STEP}
              onStep={d => setEditWeight(String(clampStep(parseFloat(editWeight) || 0, d, { max: maxWeight(settings.weight_unit) })))}
            >
              <NumberField value={editWeight} onChange={setEditWeight} aria-label="Weight" />
            </StepperTile>

            <div>
              <label className="label">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                max={todayStr()}
                className="input mt-1"
              />
            </div>

            <div>
              <label className="label">Notes <span className="text-tx-muted font-normal">(optional)</span></label>
              <input
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="e.g., morning, post-workout"
                maxLength={200}
                className="input mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setEditing(false); setEditError('') }}
                className="flex-1 py-2.5 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                type="submit"
                disabled={!(parseFloat(editWeight) > 0) || saveEdit.busy}
                className="flex-1 btn-primary py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saveEdit.busy ? 'Saving…' : 'Save'}
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
        title="Delete Entry?"
        message={`${format(dayToLocalDate(entryDay(log)), 'MMMM d, yyyy')} · ${displayWeight(log.weight, settings.weight_unit)} ${wUnit} will be permanently deleted.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={remove.busy}
        error={remove.error}
        onConfirm={handleDelete}
        onCancel={() => { setConfirming(false); remove.reset() }}
      />
    </div>
  )
}
