import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Dumbbell, AlertCircle, Zap } from 'lucide-react'
import { useAuthStore } from '../stores/auth'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [isLoading, setLoading] = useState(false)

  const navigate = useNavigate()
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = () => {
    setLoading(true)
    setTimeout(() => {
      const demoUser = { id: 1, email: 'demo@lyftr.local', created_at: new Date().toISOString() }
      localStorage.setItem('access_token', 'demo-token')
      localStorage.setItem('refresh_token', 'demo-refresh')
      localStorage.setItem('user', JSON.stringify(demoUser))
      useAuthStore.setState({ user: demoUser, isAuthenticated: true, isLoading: false })
      navigate('/')
    }, 400)
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center px-4">
      {/* Subtle top gradient — one, not three */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-500/6 to-transparent" />

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo mark */}
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center mb-5">
            <Dumbbell className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">
            Sign in to lyftr
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Your self-hosted fitness tracker
          </p>
        </div>

        {/* Form card */}
        <div className="card-glass p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary btn-lg w-full">
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-border" />
                <span className="text-xs text-slate-600">dev</span>
                <div className="flex-1 h-px bg-surface-border" />
              </div>
              <button
                onClick={handleDemoLogin}
                disabled={isLoading}
                className="btn-secondary btn-md w-full"
              >
                <Zap className="w-3.5 h-3.5 text-brand-400" />
                Continue with demo account
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-400 font-medium hover:text-brand-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
