import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, X, AlertCircle, Loader, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { userAPI } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { apiErrorMessage } from '@lyftr/shared'
import PageHeader from '../components/ui/PageHeader'

// Mirrors the backend's min=8 so the obvious mistake is caught before a round trip.
// The server still enforces it — this only saves the user a wasted request.
const MIN_LENGTH = 8

// A rule the user can see the state of while typing, rather than after submitting.
// `pending` is the untouched state: an empty field is not yet wrong, and marking it red
// before the user has typed anything reads as an error they caused.
type RuleState = 'pending' | 'ok' | 'bad'

function Rule({ state, children }: { state: RuleState; children: React.ReactNode }) {
  const tone =
    state === 'ok' ? 'text-success-400' : state === 'bad' ? 'text-error-400' : 'text-tx-muted'
  return (
    <p className={`flex items-center gap-1.5 text-xs mt-1 ${tone}`}>
      {state === 'ok' ? <Check className="w-3 h-3 flex-shrink-0" />
        : state === 'bad' ? <X className="w-3 h-3 flex-shrink-0" />
        : <span className="w-3 h-3 flex-shrink-0 rounded-full border border-current opacity-40" aria-hidden="true" />}
      {children}
    </p>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  children?: React.ReactNode
}

// Caps Lock is tracked per field rather than for the form: it can only be read from a key
// event, so the field the user is actually typing in is the only one with a real answer.
function PasswordField({ id, label, value, onChange, autoComplete, children }: FieldProps) {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-tx-muted">{label}</label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input pr-11"
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyUp={e => setCaps(e.getModifierState('CapsLock'))}
          onBlur={() => setCaps(false)}
          required
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          // tabIndex -1 keeps Tab going straight down the three fields to the submit
          // button, which is the path someone filling this form actually wants.
          tabIndex={-1}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-tx-muted hover:text-tx-primary transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {caps && (
        <p className="flex items-center gap-1.5 text-xs mt-1 text-warning-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> Caps Lock is on
        </p>
      )}
      {children}
    </div>
  )
}

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

  const longEnough = next.length >= MIN_LENGTH
  const isDifferent = next !== current
  const matches = next === confirm

  const lengthRule: RuleState = !next ? 'pending' : longEnough ? 'ok' : 'bad'
  const differentRule: RuleState = !next || !current ? 'pending' : isDifferent ? 'ok' : 'bad'
  const matchRule: RuleState = !confirm ? 'pending' : matches ? 'ok' : 'bad'

  const ready = !!current && longEnough && isDifferent && matches

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // The rules above already show these states while typing and the button is disabled
    // until they pass, so this is a backstop rather than the primary feedback — a form
    // can still be submitted by other means, and the server is the real authority.
    if (!ready) return

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

        <div className="card p-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-success-500/10 border border-success-500/20 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-success-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-tx-primary">Password changed</h1>
            <p className="text-sm text-tx-muted mt-1">
              You are still signed in here. Every other device has been signed out and will
              need the new password.
            </p>
          </div>
          <Link to="/settings" className="btn-secondary btn-sm mt-1">Back to settings</Link>
        </div>
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

      <form onSubmit={submit} className="card p-4 space-y-4">
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

        <PasswordField
          id="current-password"
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />

        <PasswordField
          id="new-password"
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        >
          <Rule state={lengthRule}>At least {MIN_LENGTH} characters</Rule>
          <Rule state={differentRule}>Different from your current password</Rule>
        </PasswordField>

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        >
          <Rule state={matchRule}>
            {matchRule === 'bad' ? 'Passwords do not match' : 'Passwords match'}
          </Rule>
        </PasswordField>

        {/* Server-side failures only — a wrong current password, or a change that landed
            elsewhere first. Everything checkable in the browser is a Rule above, so this
            box appearing always means the request was actually made and refused. */}
        {error && (
          <div className="alert-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !ready}
            className="btn-primary btn-sm flex-1 flex items-center justify-center gap-2"
          >
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
