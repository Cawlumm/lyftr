import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Scale, Trash2, Edit2, Save, X, AlertCircle, Loader } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, lbsToDisplay, displayToLbs } from '../stores/settings'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isPositiveNumber } from '../utils/numberUtils'
import { todayStr, dayToIsoNoon, isoToDayInput } from '../utils/dateUtils'
import WeightInput from '../components/WeightInput'
import * as types from '../types'

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
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirm
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useBodyScrollLock(confirming)
  useEscapeKey(confirming, () => setConfirming(false))
  useEscapeKey(editing, () => { setEditing(false); setEditError('') })

  useEffect(() => {
    weightAPI.get(Number(id))
      .then(data => {
        setLog(data)
        setEditWeight(String(Math.round(lbsToDisplay(data.weight, settings.weight_unit))))
        setEditDate(isoToDayInput(data.logged_at))
        setEditNotes(data.notes ?? '')
      })
      .catch(err => setError(err?.response?.data?.error || 'Failed to load entry'))
      .finally(() => setLoading(false))
  }, [id])

  const startEdit = () => {
    if (!log) return
    setEditWeight(String(Math.round(lbsToDisplay(log.weight, settings.weight_unit))))
    setEditDate(isoToDayInput(log.logged_at))
    setEditNotes(log.notes ?? '')
    setEditError('')
    setEditing(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!log || saving) return
    const w = parseFloat(editWeight)
    if (!Number.isFinite(w) || w <= 0) {
      setEditError('Enter a valid weight')
      return
    }
    setSaving(true)
    setEditError('')
    try {
      const updated = await weightAPI.update(log.id, {
        weight: displayToLbs(w, settings.weight_unit),
        notes: editNotes.trim(),
        logged_at: dayToIsoNoon(editDate),
      })
      setLog(updated)
      setEditing(false)
    } catch (err: any) {
      setEditError(err?.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!log || deleting) return
    setDeleting(true)
    try {
      await weightAPI.delete(log.id)
      navigate('/weight', { replace: true })
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
                  <span className="stat-value text-5xl tabular-nums">{Math.round(lbsToDisplay(log.weight, settings.weight_unit))}</span>
                  <span className="text-tx-muted text-lg mb-1">{wUnit}</span>
                </div>
                <p className="text-sm text-tx-muted mt-1">
                  {format(new Date(log.logged_at), 'EEEE, MMMM d, yyyy')}
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
            {editError && (
              <div className="alert-error" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div>
              <label className="label">Weight</label>
              <div className="mt-1">
                <WeightInput
                  value={editWeight}
                  onChange={setEditWeight}
                  unit={wUnit}
                  size="lg"
                />
              </div>
            </div>

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
                disabled={!isPositiveNumber(editWeight) || saving}
                className="flex-1 btn-primary py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirm — bottom sheet */}
      {confirming && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-lg text-tx-primary mb-1">Delete Entry?</h3>
            <p className="text-sm text-tx-muted mb-5">
              {format(new Date(log.logged_at), 'MMMM d, yyyy')} · {Math.round(lbsToDisplay(log.weight, settings.weight_unit))} {wUnit} will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-xl transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-error-500 hover:bg-error-600 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
