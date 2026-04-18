import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Dumbbell, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../stores/auth'

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
      await register(email, password, passwordConfirm)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-500/6 to-transparent" />

      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center mb-5">
            <Dumbbell className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-slate-500 text-sm mt-1">Start tracking with lyftr</p>
        </div>

        <div className="card-glass p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                className="input" placeholder="Min 8 characters" autoComplete="new-password" required />
            </div>
            <div>
              <label htmlFor="password-confirm" className="label">Confirm password</label>
              <input id="password-confirm" type="password" value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className="input" placeholder="••••••••" autoComplete="new-password" required />
            </div>

            {error && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary btn-lg w-full">
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 font-medium hover:text-brand-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
