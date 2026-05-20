import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Zap, Dumbbell, Apple, TrendingUp, LogIn, ChevronDown, Server } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useServerStore } from '../stores/server'
import Logo from '../components/Logo'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [isLoading, setLoading]     = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [serverInput, setServerInput] = useState('')

  const navigate = useNavigate()
  const { login } = useAuthStore()
  const { serverUrl, setServerUrl } = useServerStore()

  const handleServerUrlChange = () => {
    if (serverInput.trim()) {
      setServerUrl(serverInput)
      setServerInput('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.login.errorInvalid'))
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setLoading(true)
    try {
      await login('demo@lyftr.local', 'password123')
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.login.errorDemo'))
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
            {t('auth.brand.headline')}
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">
              {t('auth.brand.highlight')}
            </span>
          </h1>

          <p className="text-tx-secondary text-base leading-relaxed max-w-sm">
            {t('auth.brand.tagline')}
          </p>

          {/* Features */}
          <div className="space-y-4">
            {[
              { icon: Dumbbell, label: t('auth.features.workouts') },
              { icon: Apple, label: t('auth.features.food') },
              { icon: TrendingUp, label: t('auth.features.progress') },
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
          {t('auth.brand.footer', { version: t('common.version') })}
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
              {t('auth.login.heading')}
            </h2>
            <p className="text-tx-muted text-sm mt-2">
              {t('auth.login.subtitle')}
            </p>
          </div>

          {/* Server settings toggle */}
          <button
            onClick={() => setShowServerSettings(!showServerSettings)}
            className="flex items-center gap-2 px-3 py-2 mb-4 text-xs text-tx-muted hover:text-tx-secondary rounded-lg hover:bg-surface-muted/40 transition-colors"
          >
            <Server className="w-3.5 h-3.5" />
            <span>{t('auth.server.toggle')}</span>
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showServerSettings ? 'rotate-180' : ''}`} />
          </button>

          {/* Server settings panel */}
          {showServerSettings && (
            <div className="mb-4 p-3 bg-surface-muted/30 border border-surface-border rounded-lg space-y-2">
              <label className="block text-xs font-medium text-tx-secondary uppercase tracking-wider">{t('auth.server.url')}</label>
              <input
                type="text"
                value={serverInput || serverUrl}
                onChange={e => setServerInput(e.target.value)}
                placeholder={t('auth.server.urlPlaceholder')}
                className="input text-sm"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleServerUrlChange}
                  disabled={!serverInput.trim()}
                  className="flex-1 px-2 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {t('common.save')}
                </button>
                <button
                  onClick={() => setShowServerSettings(false)}
                  className="flex-1 px-2 py-1.5 text-xs bg-surface-border text-tx-secondary hover:bg-surface-border/80 rounded-lg transition-colors"
                >
                  {t('common.close')}
                </button>
              </div>
              {serverUrl !== 'http://localhost:3000' && (
                <p className="text-xs text-tx-muted pt-1">{t('auth.server.current', { url: serverUrl })}</p>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="label">{t('auth.fields.email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input mt-2"
                placeholder={t('auth.fields.emailPlaceholder')}
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-2">
                <label htmlFor="password" className="label">{t('auth.fields.password')}</label>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input mt-2"
                placeholder={t('auth.fields.passwordPlaceholder')}
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Sign in button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary btn-lg w-full mt-6 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
            </button>

            {/* Divider */}
            <div className="relative flex items-center my-6">
              <div className="flex-1 h-px bg-surface-border" />
              <span className="px-3 text-xs text-tx-muted uppercase tracking-wider">{t('common.or')}</span>
              <div className="flex-1 h-px bg-surface-border" />
            </div>

            {/* Demo button — dev only */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={isLoading}
                className="btn-secondary btn-lg w-full flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 text-warning-400" />
                {t('auth.login.demo')}
              </button>
            )}
          </form>

          {/* Sign up link */}
          <p className="mt-8 text-center text-sm text-tx-muted">
            {t('auth.login.signupPrompt')}{' '}
            <Link
              to="/register"
              className="text-brand-400 font-medium hover:text-brand-300 transition-colors"
            >
              {t('auth.login.signupLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
