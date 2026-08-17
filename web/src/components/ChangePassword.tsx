import { useState } from 'react'
import { userAPI } from '../services/api'
import { apiErrorMessage } from '@lyftr/shared'
import { KeyRound, Check, AlertCircle, Loader } from 'lucide-react'

// Mirrors the backend's min=8 so the obvious mistake is caught before a round trip.
// The server still enforces it — this only saves the user a wasted request.
const MIN_LENGTH = 8

export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('')
    setError(null)
  }

  const close = () => { setOpen(false); reset() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters`)
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    if (next === current) {
      setError('New password must be different from the current one')
      return
    }

    setSaving(true)
    try {
      await userAPI.changePassword({ current_password: current, new_password: next })
      setDone(true)
      close()
      setTimeout(() => setDone(false), 6000)
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change your password. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4">
            <p className="text-sm font-medium text-tx-primary">Password</p>
            <p className="text-xs text-tx-muted mt-0.5">
              Changing it signs you out on your other devices
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn-secondary btn-sm flex-shrink-0">
            <KeyRound className="w-3.5 h-3.5" /> Change
          </button>
        </div>
        {done && (
          <div className="alert-success mt-3">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>Password changed. Your other devices have been signed out.</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="py-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-tx-primary">Change password</p>
        <p className="text-xs text-tx-muted mt-0.5">
          You will stay signed in here. Every other device is signed out.
        </p>
      </div>

      {/* The username hint is invisible but load-bearing: without it password managers
          cannot tell which account this form belongs to, and offer to save the new
          password under a blank or wrong entry. */}
      <input
        type="text"
        autoComplete="username"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        readOnly
        value=""
      />

      <div>
        <label htmlFor="current-password" className="text-xs font-medium text-tx-muted">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          className="input mt-1 w-full"
          autoComplete="current-password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="new-password" className="text-xs font-medium text-tx-muted">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          className="input mt-1 w-full"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={next}
          onChange={e => setNext(e.target.value)}
          required
        />
        <p className="text-xs text-tx-muted mt-1">At least {MIN_LENGTH} characters</p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="text-xs font-medium text-tx-muted">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          className="input mt-1 w-full"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary btn-sm flex-1 flex items-center justify-center gap-2">
          {saving ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Saving</> : 'Update password'}
        </button>
        <button type="button" onClick={close} disabled={saving} className="btn-secondary btn-sm flex-1">
          Cancel
        </button>
      </div>
    </form>
  )
}
