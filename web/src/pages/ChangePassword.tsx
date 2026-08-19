import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, AlertCircle, Loader } from 'lucide-react'
import { userAPI } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { apiErrorMessage } from '@lyftr/shared'
import PageHeader from '../components/ui/PageHeader'

// Mirrors the backend's min=8 so the obvious mistake is caught before a round trip.
// The server still enforces it — this only saves the user a wasted request.
const MIN_LENGTH = 8

// Its own route rather than a disclosure inside Settings, because /.well-known/change-password
// (W3C Change Password URL — Safari Keychain, Chrome Password Checkup, 1Password) redirects
// here. That contract needs a URL that lands on the form itself; a collapsed panel on
// /settings would drop the user on a settings list with nothing open.
export default function ChangePassword() {
  const user = useAuthStore(s => s.user)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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
      setCurrent(''); setNext(''); setConfirm('')
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change your password. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  // Success replaces the form. Leaving three filled-looking boxes under a success banner
  // invites a second submit that would fail — the current password is no longer current.
  if (done) {
    return (
      <div className="space-y-5 animate-slide-up max-w-lg">
        <Link to="/settings" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <PageHeader title="Password changed" subtitle="Your other devices have been signed out." />
        <div className="alert-success">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>You are still signed in on this device.</span>
        </div>
        <Link to="/settings" className="btn-secondary btn-sm">Back to settings</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-lg">
      <Link to="/settings" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      <PageHeader
        title="Change password"
        subtitle="You will stay signed in here. Every other device is signed out."
      />

      <form onSubmit={submit} className="card p-4 space-y-3">
        {/* Password managers key the saved entry on a username field in the same form.
            Without one they file the new password under a blank or guessed account. It has
            to carry the real address to do that — an empty value is the same as having no
            field at all. Hidden rather than absent, since the user already knows who they
            are signed in as. */}
        <input
          type="text"
          autoComplete="username"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          readOnly
          value={user?.email ?? ''}
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
          <Link to="/settings" className="btn-secondary btn-sm flex-1 flex items-center justify-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
