import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader, MailCheck } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useAsyncAction, emailChanged, onlyLetterCaseChanged } from '@lyftr/shared'
import PageHeader from '../components/ui/PageHeader'
import PasswordField from '../components/ui/PasswordField'

// A page rather than an inline row like the name, because it needs the current password.
// It confirms with a card rather than a toast because the sign-in identifier changed:
// that is a consequence the user has to be told about, not just a saved field.
export default function ChangeEmail() {
  const user = useAuthStore(s => s.user)
  const changeEmail = useAuthStore(s => s.changeEmail)
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [changedTo, setChangedTo] = useState<string | null>(null)
  const [caseOnly, setCaseOnly] = useState(false)

  const save = useAsyncAction(async () => {
    const onlyCase = onlyLetterCaseChanged(email, user?.email)
    const updated = await changeEmail(email, current)
    setCurrent('')
    setCaseOnly(onlyCase)
    setChangedTo(updated.email)
  }, "Couldn't change your email. Please try again.")

  const ready = emailChanged(email, user?.email) && !!current

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    void save.run()
  }

  if (changedTo !== null) {
    return (
      <div className="space-y-5 animate-slide-up max-w-lg">
        <Link to="/settings" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>

        <div className="card p-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-success-500/10 border border-success-500/20 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-success-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-tx-primary">Email changed</h1>
            <p className="text-sm text-tx-muted mt-1">
              Sign in with <span className="break-all text-tx-secondary">{changedTo}</span> from now on.{' '}
              {caseOnly
                ? 'Only the letter case changed, so your other devices stay signed in.'
                : 'You stay signed in here; your other devices are signed out.'}
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
        title="Change email"
        subtitle="You will sign in with the new address. Changing more than the letter case signs out your other devices."
      />

      <form onSubmit={submit} className="card p-4 space-y-4">
        <div>
          <p className="text-xs text-tx-muted">Current email</p>
          <p className="text-sm text-tx-primary font-mono break-all">{user?.email}</p>
        </div>

        <div>
          <label htmlFor="new-email" className="label">
            New email
          </label>
          <input
            id="new-email"
            type="email"
            className="input"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <PasswordField
          id="current-password"
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />

        {save.error && (
          <div className="alert-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{save.error}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={save.busy || !ready}
            className="btn-primary btn-sm flex-1 flex items-center justify-center gap-2"
          >
            {save.busy ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Saving</> : 'Update email'}
          </button>
          <Link to="/settings" className="btn-secondary btn-sm flex-1 flex items-center justify-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
