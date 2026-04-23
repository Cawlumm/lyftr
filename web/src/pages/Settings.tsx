import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useTheme } from '../hooks/useTheme'
import { exerciseAPI } from '../services/api'
import * as types from '../types'
import { HelpTip } from '../components/Tooltip'
import {
  User, Shield, Target, Moon, Sun, Server, LogOut, Trash2, ChevronRight, Check, AlertCircle, Loader,
  Dumbbell, RefreshCw,
} from 'lucide-react'

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
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

export default function Settings() {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const { settings: storedSettings, update: updateSettings, fetch: fetchSettings, setWorkoutLayout } = useSettingsStore()
  const [loading, setLoading] = useState(!useSettingsStore.getState().loaded)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [seedStatus, setSeedStatus] = useState<{ count: number; in_progress: boolean } | null>(null)
  const [seedAction, setSeedAction] = useState<'sync' | null>(null)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    weight_unit: storedSettings.weight_unit,
    calorie_target: storedSettings.calorie_target,
    protein_target: storedSettings.protein_target,
    carb_target: storedSettings.carb_target,
    fat_target: storedSettings.fat_target,
  })

  const loadSeedStatus = useCallback(async () => {
    try {
      const s = await exerciseAPI.seedStatus()
      setSeedStatus(s)
      return s
    } catch {}
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        await fetchSettings()
        const s = useSettingsStore.getState().settings
        setFormData({
          weight_unit: s.weight_unit,
          calorie_target: s.calorie_target,
          protein_target: s.protein_target,
          carb_target: s.carb_target,
          fat_target: s.fat_target,
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
    loadSeedStatus()
  }, [loadSeedStatus])

  // Poll while seeding in progress
  useEffect(() => {
    if (!seedStatus?.in_progress) return
    const id = setInterval(async () => {
      const s = await loadSeedStatus()
      if (s && !s.in_progress) clearInterval(id)
    }, 2000)
    return () => clearInterval(id)
  }, [seedStatus?.in_progress, loadSeedStatus])

  const handleSync = async () => {
    setSeedAction('sync')
    setSeedMsg(null)
    try {
      const res = await exerciseAPI.sync()
      setSeedMsg(`Synced ${res.total.toLocaleString()} exercises`)
      loadSeedStatus()
    } catch (err: any) {
      setSeedMsg(err.message || 'Sync failed')
    } finally {
      setSeedAction(null)
    }
  }


  const handleUnitChange = async (unit: 'lbs' | 'kg') => {
    setFormData(prev => ({ ...prev, weight_unit: unit }))
    try {
      await updateSettings({ ...formData, weight_unit: unit })
    } catch {}
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await updateSettings(formData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-tx-primary">Settings</h1>
        <p className="text-tx-muted text-sm mt-0.5">Preferences and account configuration</p>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-success">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>Settings saved successfully</span>
        </div>
      )}

      {/* Account */}
      <Section title="Account">
        <SettingRow label="Email" description="Your login email address">
          <span className="text-sm text-tx-muted font-mono">{user?.email}</span>
        </SettingRow>
        <SettingRow label="Member since">
          <span className="text-sm text-tx-muted">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
          </span>
        </SettingRow>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow label="Theme" description="Interface color scheme">
          <button onClick={toggleTheme} className="btn-secondary btn-sm">
            {theme === 'dark'
              ? <><Moon className="w-3.5 h-3.5" /> Dark</>
              : <><Sun className="w-3.5 h-3.5" /> Light</>
            }
          </button>
        </SettingRow>
      </Section>

      {/* Workout */}
      <Section title="Workout">
        <SettingRow label="Active workout layout" description="How exercises are shown during a workout">
          <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 border border-surface-border">
            {(['list', 'gym'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setWorkoutLayout(mode)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  storedSettings.workout_layout === mode
                    ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-sm'
                    : 'text-tx-muted hover:text-tx-primary'
                }`}
              >
                {mode === 'list' ? 'List' : 'Gym Mode'}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* Goals & Units */}
      <Section title="Goals & Units">
        <SettingRow label="Weight unit" description="Changes apply immediately across the app">
          <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 border border-surface-border">
            {(['lbs', 'kg'] as const).map(unit => (
              <button
                key={unit}
                onClick={() => handleUnitChange(unit)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  formData.weight_unit === unit
                    ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-sm'
                    : 'text-tx-muted hover:text-tx-primary'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Calorie target" description="Daily calorie goal">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.calorie_target}
              onChange={e => setFormData({ ...formData, calorie_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
              min={500}
              max={10000}
            />
            <span className="text-xs text-tx-muted">kcal</span>
          </div>
        </SettingRow>

        <SettingRow label="Protein target" description="Daily protein goal">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.protein_target}
              onChange={e => setFormData({ ...formData, protein_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>

        <SettingRow label="Carb target" description="Daily carb goal">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.carb_target}
              onChange={e => setFormData({ ...formData, carb_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>

        <SettingRow label="Fat target" description="Daily fat goal">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.fat_target}
              onChange={e => setFormData({ ...formData, fat_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">g</span>
          </div>
        </SettingRow>

        <div className="py-3 flex items-center justify-between">
          <p className="text-xs text-tx-muted">Save calorie and macro targets</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary btn-sm"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save targets'}
          </button>
        </div>
      </Section>

      {/* Server info */}
      <Section title="Self-Hosted Instance">
        <SettingRow label="API server" description="Backend server this client is connected to">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0" />
            <span className="text-xs font-mono text-tx-muted">localhost:3000</span>
          </div>
        </SettingRow>
        <SettingRow label="Database" description="Storage backend">
          <span className="badge-dim">SQLite</span>
        </SettingRow>
        <SettingRow label="Version" description="lyftr backend version">
          <span className="text-xs text-tx-muted font-mono">v0.1.0</span>
        </SettingRow>
      </Section>

      {/* Exercise Library */}
      <Section title="Exercise Library">
        <SettingRow
          label="Exercise database"
          description="800+ exercises seeded automatically on first run"
        >
          <div className="flex items-center gap-2">
            {seedStatus?.in_progress ? (
              <span className="flex items-center gap-1.5 text-xs text-brand-400">
                <Loader className="w-3.5 h-3.5 animate-spin" /> Seeding...
              </span>
            ) : (
              <span className="text-sm font-mono text-tx-muted">
                {seedStatus ? seedStatus.count.toLocaleString() : '—'} exercises
              </span>
            )}
          </div>
        </SettingRow>

        {seedMsg && (
          <div className="py-2 px-1">
            <p className="text-xs text-tx-muted">{seedMsg}</p>
          </div>
        )}

        <div className="py-3">
          <button
            onClick={handleSync}
            disabled={!!seedAction || seedStatus?.in_progress}
            className="btn-secondary btn-sm"
          >
            {seedAction === 'sync'
              ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Syncing...</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Re-sync</>
            }
          </button>
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <SettingRow label="Sign out" description="Log out of this device">
          <button onClick={() => logout()} className="btn-secondary btn-sm">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </SettingRow>
        <SettingRow label="Delete account" description="Permanently delete all your data">
          <button className="btn-danger btn-sm">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </SettingRow>
      </Section>
    </div>
  )
}
