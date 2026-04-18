import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, Dumbbell, Apple, Scale, Settings, LogOut, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../hooks/useTheme'

const NAV = [
  { path: '/',         label: 'Home',     icon: Home },
  { path: '/workouts', label: 'Workouts', icon: Dumbbell },
  { path: '/food',     label: 'Food',     icon: Apple },
  { path: '/weight',   label: 'Weight',   icon: Scale },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  const { logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
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
            <span className="font-display font-bold text-lg text-white tracking-tight">
              lyftr
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button onClick={toggleTheme} className="btn-icon btn-ghost" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => logout()} className="btn-icon btn-ghost" aria-label="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
