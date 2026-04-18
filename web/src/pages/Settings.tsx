import { useAuthStore } from '../stores/auth'
import { useTheme } from '../hooks/useTheme'
import { HelpTip } from '../components/Tooltip'
import {
  User, Shield, Target, Ruler, Moon, Sun,
  Server, LogOut, Trash2, ChevronRight, Check,
} from 'lucide-react'

function SettingRow({
  label, description, children
}: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-tx-primary">{label}</p>
        {description && <p className="text-xs text-tx-muted mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 bg-surface-muted border-b border-surface-border">
        <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider">{title}</p>
      </div>
      <div className="px-5 divide-y divide-surface-border">
        {children}
      </div>
    </div>
  )
}

function UnitToggle({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 border border-surface-border">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
            value === opt
              ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
              : 'text-tx-muted hover:text-tx-primary'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-tx-primary">Settings</h1>
        <p className="text-tx-muted text-sm mt-0.5">Preferences and account configuration</p>
      </div>

      {/* Account */}
      <Section title="Account">
        <SettingRow label="Email" description="Your login email address">
          <span className="text-sm text-tx-muted font-mono">{user?.email}</span>
        </SettingRow>
        <SettingRow label="Password" description="Change your password">
          <button className="btn-secondary btn-sm">
            Change <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </SettingRow>
        <SettingRow label="Member since" description="">
          <span className="text-sm text-tx-muted">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
          </span>
        </SettingRow>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow label="Theme" description="Interface color scheme">
          <button
            onClick={toggleTheme}
            className="btn-secondary btn-sm"
          >
            {theme === 'dark'
              ? <><Moon className="w-3.5 h-3.5" /> Dark</>
              : <><Sun  className="w-3.5 h-3.5" /> Light</>
            }
          </button>
        </SettingRow>
      </Section>

      {/* Goals & units */}
      <Section title="Goals & Units">
        <SettingRow
          label="Weight unit"
          description="Displayed across the entire app"
        >
          <UnitToggle value="lbs" onChange={() => {}} options={['lbs', 'kg']} />
        </SettingRow>
        <SettingRow
          label="Calorie target"
          description="Daily calorie goal"
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              defaultValue={2000}
              className="input w-24 text-right"
              min={500}
              max={10000}
            />
            <span className="text-xs text-tx-muted">kcal</span>
          </div>
        </SettingRow>
        <SettingRow label="Protein target" description="">
          <div className="flex items-center gap-2">
            <input type="number" defaultValue={150} className="input w-24 text-right" />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>
        <SettingRow label="Carb target" description="">
          <div className="flex items-center gap-2">
            <input type="number" defaultValue={250} className="input w-24 text-right" />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>
        <SettingRow label="Fat target" description="">
          <div className="flex items-center gap-2">
            <input type="number" defaultValue={65} className="input w-24 text-right" />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>
        <div className="py-3 flex justify-end">
          <button className="btn-primary btn-sm">
            <Check className="w-3.5 h-3.5" /> Save goals
          </button>
        </div>
      </Section>

      {/* Server info */}
      <Section title="Self-Hosted Instance">
        <SettingRow
          label="API server"
          description="Backend server this client is connected to"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0" />
            <span className="text-xs font-mono text-tx-muted">localhost:3000</span>
          </div>
        </SettingRow>
        <SettingRow
          label="Database"
          description="Storage backend"
        >
          <span className="badge-dim">SQLite</span>
        </SettingRow>
        <SettingRow
          label="Version"
          description="lyftr backend version"
        >
          <span className="text-xs text-tx-muted font-mono">v0.1.0</span>
        </SettingRow>
      </Section>

      {/* Danger zone */}
      <Section title="Danger Zone">
        <SettingRow label="Sign out" description="Log out of this device">
          <button onClick={() => logout()} className="btn-secondary btn-sm">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </SettingRow>
        <SettingRow
          label="Delete account"
          description="Permanently delete all your data from this server"
        >
          <button className="btn-danger btn-sm">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </SettingRow>
      </Section>

    </div>
  )
}
