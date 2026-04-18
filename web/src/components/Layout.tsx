import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export default function Layout() {
  const { logout } = useAuthStore()
  const location = useLocation()

  const navItems = [
    { path: '/', label: '🏠 Home', icon: '🏠' },
    { path: '/workouts', label: '💪 Workouts', icon: '💪' },
    { path: '/food', label: '🍽️ Food', icon: '🍽️' },
    { path: '/weight', label: '⚖️ Weight', icon: '⚖️' },
    { path: '/settings', label: '⚙️ Settings', icon: '⚙️' },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-primary">💪</div>
            <h1 className="text-xl font-bold text-slate-900">LYFTER</h1>
          </div>
          <button
            onClick={() => logout()}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="border-t border-slate-200 bg-white sticky bottom-0">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-around">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 py-4 px-2 text-center text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="text-lg">{item.icon}</div>
                <div className="hidden sm:block">{item.label.split(' ')[1]}</div>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
