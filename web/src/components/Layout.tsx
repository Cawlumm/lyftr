import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  Home, Dumbbell, Apple, Scale, Settings,
  LogOut, Moon, Sun, User, ChevronDown,
  Bell, Shield,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../hooks/useTheme'

const NAV = [
  { path: '/',         label: 'Home',     icon: Home },
  { path: '/workouts', label: 'Workouts', icon: Dumbbell },
  { path: '/food',     label: 'Food',     icon: Apple },
  { path: '/weight',   label: 'Weight',   icon: Scale },
  { path: '/settings', label: 'Settings', icon: Settings },
]

function UserMenu() {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-bold text-white leading-none">{initials}</span>
        </div>
        <span className="hidden sm:block text-sm font-medium text-tx-secondary max-w-[120px] truncate">
          {user?.email?.split('@')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-tx-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-surface-overlay border border-surface-border rounded-xl shadow-dropdown z-50 animate-slide-up overflow-hidden">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-white">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tx-primary truncate">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-tx-muted truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted transition-colors"
            >
              <User className="w-4 h-4" />
              Profile & Settings
            </Link>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-tx-secondary hover:text-tx-primary hover:bg-surface-muted transition-colors"
            >
              {theme === 'dark'
                ? <><Sun  className="w-4 h-4" /> Switch to Light mode</>
                : <><Moon className="w-4 h-4" /> Switch to Dark mode</>
              }
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-surface-border py-1">
            <div className="flex items-center gap-2 px-4 py-2">
              <Shield className="w-3.5 h-3.5 text-tx-muted flex-shrink-0" />
              <span className="text-xs text-tx-muted truncate">Self-hosted · localhost:3000</span>
            </div>
            <button
              onClick={() => { logout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error-400 hover:bg-error-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
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

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-surface-border bg-surface-base/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-lg text-tx-primary tracking-tight">
              lyftr
            </span>
          </div>

          <UserMenu />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 py-7 animate-fade-in">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-50 border-t border-surface-border bg-surface-base/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 flex">
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
  )
}
