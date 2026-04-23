import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Dumbbell, Apple, Scale, BookOpen,
  LogOut, Moon, Sun, User,
  Shield, Timer, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../hooks/useTheme'
import { useWorkoutSession } from '../stores/workoutSession'
import { useSettingsStore, weightShort } from '../stores/settings'
import GymModeWorkout from '../pages/GymModeWorkout'
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
  const { session, gymOpen, openGym } = useWorkoutSession()
  const { settings } = useSettingsStore()
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

  if (!session) return null
  // Hide pill when gym mode overlay is open or when on active workout page in list mode
  if (gymOpen && settings.workout_layout === 'gym') return null
  if (pathname === '/workout/active' && settings.workout_layout !== 'gym') return null

  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter(set => set.completed).length, 0)
  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)

  const handleClick = () => {
    if (settings.workout_layout === 'gym') {
      openGym()
    } else {
      navigate('/workout/active')
    }
  }

  return (
    <div className="absolute bottom-full left-0 right-0 flex justify-center pb-3 pointer-events-none">
      <button
        onClick={handleClick}
        className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 active:scale-95 shadow-lg shadow-brand-500/40 rounded-full transition-all"
      >
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Timer className="w-3 h-3 text-white" />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-white leading-tight truncate max-w-[140px]">{session.name}</p>
          <p className="text-[11px] text-white/70 leading-tight">{completedSets}/{totalSets} sets · {formatElapsed(elapsed)}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/80 flex-shrink-0" />
      </button>
    </div>
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

  const username = user?.email?.split('@')[0] ?? 'U'
  const initial = username[0].toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
          open
            ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-base'
            : 'hover:ring-2 hover:ring-surface-border hover:ring-offset-2 hover:ring-offset-surface-base'
        }`}
        aria-label="User menu"
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0891b2, #00b8d9)' }}>
          <span className="text-sm font-bold text-white leading-none">{initial}</span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface-overlay border border-surface-border/60 rounded-2xl shadow-dropdown z-50 animate-slide-up overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-surface-border/40">
            <p className="text-sm font-semibold text-tx-primary truncate">{username}</p>
            <p className="text-xs text-tx-muted truncate">{user?.email}</p>
          </div>

          {/* Actions */}
          <div className="py-1.5">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted/50 transition-colors"
            >
              <User className="w-4 h-4 text-tx-muted flex-shrink-0" />
              Settings
            </Link>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted/50 transition-colors"
            >
              {theme === 'dark'
                ? <><Sun className="w-4 h-4 text-tx-muted flex-shrink-0" />Light mode</>
                : <><Moon className="w-4 h-4 text-tx-muted flex-shrink-0" />Dark mode</>
              }
            </button>
          </div>

          {/* Sign out */}
          <div className="border-t border-surface-border/40 py-1.5">
            <button
              onClick={() => { logout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error-400 hover:bg-error-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const { session, gymOpen } = useWorkoutSession()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="sticky top-0 z-50 border-b border-surface-border bg-surface-base/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 h-14 flex justify-between items-center">
          <Link to="/"><Logo size="md" /></Link>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full min-w-0 overflow-x-hidden px-5 py-7 animate-fade-in">
        <Outlet />
      </main>

      {/* Gym mode overlay — rendered at root so it persists across routes */}
      {session && settings.workout_layout === 'gym' && gymOpen && (
        <GymModeWorkout wUnit={wUnit} />
      )}

      {/* Active session pill floats above bottom nav */}
      <div className="sticky bottom-0 z-50 relative">
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
