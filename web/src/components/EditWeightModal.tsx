import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Scale, AlertCircle, Save } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, displayToLbs, displayWeight , weightError, maxWeight } from '../stores/settings'
import WeightInput from './WeightInput'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { dayToIsoNoon, isoToDayInput, todayStr } from '../utils/dateUtils'
import * as types from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  log: types.WeightLog | null
}

export default function EditWeightModal({ isOpen, onClose, onSuccess, log }: Props) {
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  const [weight, setWeight] = useState('')
  const [loggedAt, setLoggedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !log) return
    setWeight(String(displayWeight(log.weight, settings.weight_unit)))
    setLoggedAt(isoToDayInput(log.logged_at))
    setNotes(log.notes ?? '')
    setError('')
  }, [isOpen, log])

  const handleClose = () => { setError(''); onClose() }

  useBodyScrollLock(isOpen && !!log)
  useEscapeKey(isOpen && !!log, handleClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!log || saving) return
    const w = parseFloat(weight)
    const wErr = weightError(w, settings.weight_unit)
    if (wErr) {
      setError(wErr)
      return
    }
    setSaving(true)
    setError('')
    try {
      await weightAPI.update(log.id, {
        weight: displayToLbs(w, settings.weight_unit),
        notes: notes.trim(),
        logged_at: dayToIsoNoon(loggedAt),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !log) return null

  return createPortal((
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ewm-title"
        className="bg-surface-base border border-surface-border rounded-2xl w-full max-h-[90vh] sm:max-w-md overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-surface-border bg-surface-base px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-500" />
            <h2 id="ewm-title" className="font-display font-bold text-xl text-tx-primary">Edit Weight</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-tx-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="alert-error" role="alert" aria-live="polite">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label">Weight</label>
            <div className="mt-1">
              <WeightInput value={weight} onChange={setWeight} unit={wUnit} max={maxWeight(settings.weight_unit)} autoFocus />
            </div>
          </div>

          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={loggedAt}
              onChange={e => setLoggedAt(e.target.value)}
              className="input mt-1"
              max={todayStr()}
            />
          </div>

          <div>
            <label className="label">Notes <span className="text-tx-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., after run, post-meal"
              className="input mt-1"
              maxLength={200}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-surface-muted hover:bg-surface-muted/80 text-tx-secondary rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!(parseFloat(weight) > 0) || saving}
              className="btn-primary btn-md"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ), document.body)
}
