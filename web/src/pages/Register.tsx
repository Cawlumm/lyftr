import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AlertCircle, Dumbbell, Apple, TrendingUp, UserPlus, Lock } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { apiErrorMessage } from '../services/api'
import { useServerInfo } from '../hooks/useServerInfo'
import { formatVersion, registrationOpen, lengthRuleLabel, matchRuleLabel, newPasswordRules } from '@lyftr/shared'
import Logo from '../components/Logo'
import ServerSettings from '../components/ServerSettings'
import PasswordField, { Rule } from '../components/ui/PasswordField'

export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuthStore()
  const serverInfo = useServerInfo()
  const isOpen = registrationOpen(serverInfo)

  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError]                     = useState('')
  const [isLoading, setLoading]               = useState(false)

  const rules = newPasswordRules({ password, confirm: passwordConfirm })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // The rules render under the fields as they type and the button is disabled until
    // they pass, so this is a backstop. The banner below is now server failures only.
    if (!rules.ready) return
    setLoading(true)
    try {
      await register(email, password)
      navigate('/')
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-surface-base">
      {/* Left side — branding */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden" style={{
        background: 'linear-gradient(135deg, #030812 0%, #0a1b2e 50%, #081326 100%)',
      }}>
        {/* Gradient overlays */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 20% 30%, rgba(0, 184, 217, 0.25) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)
            `,
          }}
        />

        {/* Logo */}
        <div className="relative">
          <Logo size="md" />
        </div>

        {/* Headline and features */}
        <div className="relative space-y-8">
          <h1 className="font-display font-bold text-5xl leading-tight tracking-tight">
            Log. Lift.
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">
              Progress.
            </span>
          </h1>

          <p className="text-tx-secondary text-base leading-relaxed max-w-sm">
            Your self-hosted fitness tracker. Track workouts, log food, monitor weight — all under your control, running on your own server.
          </p>

          {/* Features */}
          <div className="space-y-4">
            {[
              { icon: Dumbbell, label: 'Track workouts' },
              { icon: Apple, label: 'Log food + macros' },
              { icon: TrendingUp, label: 'See progress' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-tx-muted text-sm">
                <Icon className="w-4 h-4 text-brand-500" strokeWidth={2} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative text-tx-muted text-xs">
          © lyftr{serverInfo?.version ? ` · ${formatVersion(serverInfo.version)}` : ''}
        </div>
      </div>

      {/* Right side — form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Logo size="lg" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="font-display font-bold text-3xl text-tx-primary tracking-tight">
              {isOpen ? 'Create account' : 'Registration closed'}
            </h2>
            <p className="text-tx-muted text-sm mt-2">
              {isOpen
                ? 'Start tracking your fitness today.'
                : 'This server is not accepting new accounts.'}
            </p>
          </div>

          {/* Server selector — stays visible when closed: the user may simply be
              pointed at the wrong server, and this is where they'd fix that. */}
          <ServerSettings />

          {/* A closed instance explains itself rather than letting someone fill in the
              form and meet a 403 on submit. The server is what enforces this. */}
          {!isOpen ? (
            <div className="mt-6 space-y-6">
              <div className="flex gap-3 rounded-xl border border-surface-border bg-surface-raised p-4">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-tx-muted" />
                <p className="text-sm text-tx-secondary leading-relaxed">
                  The owner of this Lyftr instance has turned off new signups. If you should
                  have an account here, ask them to create one for you.
                </p>
              </div>
              <Link to="/login" className="btn-primary btn-lg w-full flex items-center justify-center gap-2">
                Back to sign in
              </Link>
            </div>
          ) : (
          <>
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input mt-2"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="••••••••"
            >
              <Rule state={rules.length}>{lengthRuleLabel()}</Rule>
            </PasswordField>

            {/* Confirm password */}
            <PasswordField
              id="password-confirm"
              label="Confirm password"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
              placeholder="••••••••"
            >
              <Rule state={rules.match}>{matchRuleLabel(rules.match)}</Rule>
            </PasswordField>

            {/* Error */}
            {error && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Create account button */}
            <button
              type="submit"
              disabled={isLoading || !rules.ready}
              className="btn-primary btn-lg w-full mt-6 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {/* Sign in link */}
          <p className="mt-8 text-center text-sm text-tx-muted">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-brand-400 font-medium hover:text-brand-300 transition-colors"
            >
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
