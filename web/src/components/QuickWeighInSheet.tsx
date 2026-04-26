import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Scale, Save, AlertCircle, Calendar, FileText } from 'lucide-react'
import { weightAPI } from '../services/api'
import { useSettingsStore, weightShort, displayToLbs } from '../stores/settings'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isPositiveNumber } from '../utils/numberUtils'
import { todayStr, dayToIsoNoon, isoToDayInput } from '../utils/dateUtils'
import WeightInput from './WeightInput'
import * as types from '../types'

interface Props {
  isOpen: boolean
  lastValue: number | null
  lastLog?: types.WeightLog | null
  onClose: () => void
  onSuccess: (log: types.WeightLog) => void
}

export default function QuickWeighInSheet({ isOpen, lastValue, lastLog, onClose, onSuccess }: Props) {
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [showExtras, setShowExtras] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const duplicateWarningDismissedRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setValue(lastValue && lastValue > 0 ? String(lastValue) : '')
    setDate(todayStr())
    setNotes('')
    setShowExtras(false)
    setError('')
    setSaving(false)
    setShowDuplicateWarning(false)
    duplicateWarningDismissedRef.current = false
  }, [isOpen, lastValue])

  const handleClose = () => { setError(''); onClose() }

  useBodyScrollLock(isOpen)
  useEscapeKey(isOpen, handleClose)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const w = parseFloat(value)
    if (!Number.isFinite(w) || w <= 0) {
      setError('Enter a valid weight')
      return
    }

    if (!duplicateWarningDismissedRef.current && lastLog && isoToDayInput(lastLog.logged_at) === date) {
      setShowDuplicateWarning(true)
      return
    }

    setSaving(true)
    setError('')
    setShowDuplicateWarning(false)
    try {
      const log = await weightAPI.log({
        weight: displayToLbs(w, settings.weight_unit),
        notes: notes.trim(),
        logged_at: dayToIsoNoon(date),
      })
      onSuccess(log)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  return createPortal((
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qws-title"
        className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <Scale className="w-4 h-4 text-brand-500" />
            </div>
            <h2 id="qws-title" className="font-display font-bold text-lg text-tx-primary">Log Weight</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-tx-muted" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="alert-error" role="alert" aria-live="polite">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {showDuplicateWarning && lastLog && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Already logged today ({Math.round(lastValue ?? 0)} {wUnit}). Log again anyway?</p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateWarning(false)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-surface-overlay border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateWarningDismissedRef.current = true
                      setShowDuplicateWarning(false)
                      formRef.current?.requestSubmit()
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition-colors"
                  >
                    Log Anyway
                  </button>
                </div>
              </div>
            </div>
          )}

          <WeightInput
            value={value}
            onChange={setValue}
            unit={wUnit}
            autoFocus
            size="lg"
          />

          {!showExtras ? (
            <button
              type="button"
              onClick={() => setShowExtras(true)}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
            >
              + Change date or add a note
            </button>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <label className="label">
                  <Calendar className="w-3 h-3" /> Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  max={todayStr()}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">
                  <FileText className="w-3 h-3" /> Note <span className="text-tx-muted font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g., morning, post-workout"
                  maxLength={200}
                  className="input mt-1"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!isPositiveNumber(value) || saving}
            className="btn-primary btn-lg w-full"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  ), document.body)
}
