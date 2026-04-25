import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Scale, AlertCircle, Save } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort } from '../stores/settings'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isPositiveNumber } from '../utils/numberUtils'
import * as types from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  log: types.WeightLog | null
}

const toDateInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
    setWeight(String(log.weight))
    setLoggedAt(toDateInput(log.logged_at))
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
    if (!Number.isFinite(w) || w <= 0) {
      setError('Enter a valid weight')
      return
    }
    setSaving(true)
    setError('')
    try {
      await weightAPI.update(log.id, {
        weight: w,
        notes: notes.trim(),
        logged_at: new Date(`${loggedAt}T12:00:00`).toISOString(),
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
            <div className="relative mt-1">
              <input
                type="number"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                step="0.1"
                min="0"
                className="input pr-10"
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-tx-muted">{wUnit}</span>
            </div>
          </div>

          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={loggedAt}
              onChange={e => setLoggedAt(e.target.value)}
              className="input mt-1"
              max={toDateInput(new Date().toISOString())}
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
              disabled={!isPositiveNumber(weight) || saving}
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
