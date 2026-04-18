import { useAuthStore } from '../stores/auth'

export default function Settings() {
  const { user } = useAuthStore()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-600 mt-1">Manage your account</p>
      </div>

      <div className="card">
        <h3 className="font-bold text-slate-900 mb-4">Account</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="input bg-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Joined
            </label>
            <input
              type="text"
              value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : ''}
              disabled
              className="input bg-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="card text-center py-12">
        <p className="text-slate-600">More settings coming soon</p>
        <p className="text-sm text-slate-500 mt-2">Preferences, goals, and other options</p>
      </div>
    </div>
  )
}
