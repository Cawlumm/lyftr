import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Dumbbell, Apple, Scale, BookOpen,
  LogOut, Moon, Sun, User, ChevronDown,
  Shield, Timer, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../hooks/useTheme'
import { useWorkoutSession } from '../stores/workoutSession'
import Logo from './Logo'

const NAV = [
  { path: '/',          label: 'Home',     icon: Home },
  { path: '/workouts',  label: 'Workouts', icon: Dumbbell },
  { path: '/programs',  label: 'Programs', icon: BookOpen },
  { path: '/food',      label: 'Food',     icon: Apple },
  { path: '/weight',    label: 'Weight',   icon: Scale },
]

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function ActiveSessionBar() {
  const { session } = useWorkoutSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!session) return
    const started = new Date(session.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session])

  if (!session || pathname === '/workout/active') return null

  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter(set => set.completed).length, 0)
  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)

  return (
    <button
      onClick={() => navigate('/workout/active')}
      className="w-full flex items-center justify-between px-4 py-2.5 bg-brand-500 hover:bg-brand-600 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
          <Timer className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-white leading-tight truncate max-w-[160px]">{session.name}</p>
          <p className="text-xs text-white/70">{completedSets}/{totalSets} sets · {formatElapsed(elapsed)}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-white">Resume</span>
        <ChevronRight className="w-4 h-4 text-white/80" />
      </div>
    </button>
  )
}

function UserMenu() {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-muted/60 active:bg-surface-muted transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center flex-shrink-0 ring-1 ring-brand-400/30">
          <span className="text-xs font-bold text-white leading-none">{initials}</span>
        </div>
        <span className="hidden sm:block text-sm font-medium text-tx-secondary max-w-[100px] truncate">
          {user?.email?.split('@')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-tx-muted group-hover:text-tx-secondary transition-all duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-surface-overlay border border-surface-border rounded-2xl shadow-dropdown z-50 animate-slide-up overflow-hidden">
          <div className="px-4 py-4 border-b border-surface-border/50 bg-surface-raised/40">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center flex-shrink-0 ring-2 ring-brand-400/30">
                <span className="text-sm font-bold text-white">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-tx-primary truncate">{user?.email?.split('@')[0]}</p>
                <p className="text-xs text-tx-muted truncate mt-0.5">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="py-2">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted/50 transition-colors"
            >
              <User className="w-4 h-4 text-tx-muted" />
              <span>Profile & Settings</span>
            </Link>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted/50 transition-colors"
            >
              {theme === 'dark'
                ? <><Sun className="w-4 h-4 text-tx-muted" /><span>Switch to Light</span></>
                : <><Moon className="w-4 h-4 text-tx-muted" /><span>Switch to Dark</span></>
              }
            </button>
          </div>

          <div className="border-t border-surface-border/50 py-2">
            <div className="flex items-center gap-2 px-4 py-2">
              <Shield className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
              <span className="text-xs text-tx-muted">Self-hosted · localhost:3000</span>
            </div>
            <button
              onClick={() => { logout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error-400 hover:bg-error-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="sticky top-0 z-50 border-b border-surface-border bg-surface-base/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 h-14 flex justify-between items-center">
          <Logo size="md" />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-5 py-7 animate-fade-in">
        <Outlet />
      </main>

      {/* Active session bar sits above bottom nav */}
      <div className="sticky bottom-0 z-50">
        <ActiveSessionBar />
        <nav className="border-t border-surface-border bg-surface-base/95 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex">
            {NAV.map(({ path, label, icon: Icon }) => {
              const active = pathname === path
              return (
                <Link key={path} to={path} className={`nav-item flex-1 ${active ? 'active' : ''}`}>
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
