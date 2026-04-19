import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AlertCircle, Dumbbell, Apple, TrendingUp, UserPlus } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import Logo from '../components/Logo'

export default function Register() {
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError]                     = useState('')
  const [isLoading, setLoading]               = useState(false)

  const navigate = useNavigate()
  const { register } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== passwordConfirm) { setError('Passwords do not match'); return }
    if (password.length < 8)          { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await register(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed.')
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
          © lyftr · v0.1.0
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
              Create account
            </h2>
            <p className="text-tx-muted text-sm mt-2">
              Start tracking your fitness today.
            </p>
          </div>

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
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input mt-2"
                placeholder="Min 8 characters"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="password-confirm" className="label">Confirm password</label>
              <input
                id="password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className="input mt-2"
                placeholder="••••••••"
                autoComplete="new-password"
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

            {/* Create account button */}
            <button
              type="submit"
              disabled={isLoading}
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
        </div>
      </div>
    </div>
  )
}
