import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader, MailCheck } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { Trans, useAsyncAction, useTranslation, emailChanged, onlyLetterCaseChanged } from '@lyftr/shared'
import PageHeader from '../components/ui/PageHeader'
import PasswordField from '../components/ui/PasswordField'

// A page rather than an inline row like the name, because it needs the current password.
// It confirms with a card rather than a toast because the sign-in identifier changed:
// that is a consequence the user has to be told about, not just a saved field.
export default function ChangeEmail() {
  const { t } = useTranslation()
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
  }, t('settings.account.email.changeFailed'))

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
          <ArrowLeft className="w-4 h-4" /> {t('settings.account.backLink')}
        </Link>

        <div className="card p-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-success-500/10 border border-success-500/20 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-success-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-tx-primary">{t('settings.account.email.changedTitle')}</h1>
            <p className="text-sm text-tx-muted mt-1">
              <Trans
                i18nKey="settings.account.email.signInWith"
                values={{ email: changedTo }}
                tOptions={{ interpolation: { escapeValue: true } }}
                shouldUnescape
                components={{ email: <span className="break-all text-tx-secondary" /> }}
              />{' '}
              {caseOnly
                ? t('settings.account.email.caseOnly')
                : t('settings.account.email.signedOutElsewhere')}
            </p>
          </div>
          <Link to="/settings" className="btn-secondary btn-sm mt-1">{t('settings.account.backToSettings')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-lg">
      <Link to="/settings" className="flex items-center gap-1.5 text-sm text-tx-muted hover:text-tx-primary transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('settings.account.backLink')}
      </Link>

      <PageHeader
        title={t('settings.account.email.pageTitle')}
        subtitle={t('settings.account.email.pageSubtitle')}
      />

      <form onSubmit={submit} className="card p-4 space-y-4">
        <div>
          <p className="text-xs text-tx-muted">{t('settings.account.email.current')}</p>
          <p className="text-sm text-tx-primary font-mono break-all">{user?.email}</p>
        </div>

        <div>
          <label htmlFor="new-email" className="label">
            {t('settings.account.email.new')}
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
          label={t('settings.account.password.current')}
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
            {save.busy ? <><Loader className="w-3.5 h-3.5 animate-spin" /> {t('settings.account.saving')}</> : t('settings.account.email.submit')}
          </button>
          <Link to="/settings" className="btn-secondary btn-sm flex-1 flex items-center justify-center">
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  )
}
