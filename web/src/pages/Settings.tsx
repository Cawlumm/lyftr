import { useState, useEffect, useCallback } from 'react'
import { useAsyncAction, memberSince } from '@lyftr/shared'
import { useAuthStore } from '../stores/auth'
import { useServerStore } from '../stores/server'
import { useServerInfo } from '../hooks/useServerInfo'
import { useSettingsStore } from '../stores/settings'
import { useTheme } from '../hooks/useTheme'
import { exerciseAPI } from '../services/api'
import PageHeader from '../components/ui/PageHeader'
import ServerSettings from '../components/ServerSettings'
import { Link } from 'react-router-dom'
import {
  Moon, Sun, LogOut, Trash2, Check, AlertCircle, Loader,
  RefreshCw, Pencil, Clock, Minus, Plus, KeyRound,
} from 'lucide-react'

// Wraps per row, on content rather than on viewport width.
//
// Originally this was side-by-side at every width with `flex-shrink-0` on the value.
// Since the value could not shrink, a wide one — an email address, most obviously — took
// the space it wanted and the label column absorbed all the squeeze, so "Your login email
// address" wrapped down four near-empty lines at 390px while the address still clipped at
// the card edge.
//
// Stacking everything below `sm` fixed that and overcorrected: a compact control like the
// theme toggle got dropped onto its own line too, for no gain, and the page grew to a
// ~2800px scroll on a phone. `flex-wrap` asks the right question instead — does this
// particular value fit beside its label? A toggle does and stays inline; an email address
// does not and takes the next line at full width. No breakpoint decides it, so the row is
// right at any width and for any content.
//
// The label keeps a `min-w` floor so wrapping actually triggers: with `min-w-0` alone it
// would shrink to nothing and the pair would stay jammed on one line forever.
function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
      <div className="min-w-[9rem] flex-1">
        <p className="text-sm font-medium text-tx-primary">{label}</p>
        {description && <p className="text-xs text-tx-muted mt-0.5">{description}</p>}
      </div>
      {/* break-words so a long unbroken value wraps instead of overflowing the card. */}
      <div className="min-w-0 max-w-full flex-shrink-0 break-words">{children}</div>
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
  const serverUrl = useServerStore(s => s.serverUrl)
  const serverInfo = useServerInfo()
  const { theme, toggleTheme } = useTheme()
  const { settings: storedSettings, update: updateSettings, fetch: fetchSettings, setWorkoutLayout, setRestEnabled, setRestSeconds } = useSettingsStore()
  const [loading, setLoading] = useState(!useSettingsStore.getState().loaded)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showCustomRest, setShowCustomRest] = useState(false)

  const [cacheStatus, setCacheStatus] = useState<{ count: number } | null>(null)
  const [seedAction, setSeedAction] = useState<'refresh' | 'clear' | null>(null)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    weight_unit: storedSettings.weight_unit,
    calorie_target: storedSettings.calorie_target,
    protein_target: storedSettings.protein_target,
    carb_target: storedSettings.carb_target,
    fat_target: storedSettings.fat_target,
  })

  const loadCacheStatus = useCallback(async () => {
    try {
      const s = await exerciseAPI.cacheStatus()
      setCacheStatus(s)
      return s
    } catch { /* cache status is a best-effort probe; absence just hides the count */ }
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
    loadCacheStatus()
  }, [loadCacheStatus])

  // No polling: nothing populates the cache in the background any more. It fills as
  // a side-effect of reads, and these two actions are synchronous.

  const handleRefreshCache = async () => {
    setSeedAction('refresh')
    setSeedMsg(null)
    try {
      const res = await exerciseAPI.refreshCache()
      setSeedMsg(`Refreshed ${res.refreshed.toLocaleString()} exercises`)
      loadCacheStatus()
    } catch (err: any) {
      setSeedMsg(err.message || 'Refresh failed')
    } finally {
      setSeedAction(null)
    }
  }

  const handleClearCache = async () => {
    setSeedAction('clear')
    setSeedMsg(null)
    try {
      const res = await exerciseAPI.clearCacheOnServer()
      setSeedMsg(`Cleared ${res.cleared.toLocaleString()} unused exercises`)
      loadCacheStatus()
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setSeedAction(null)
    }
  }


  const handleUnitChange = async (unit: 'lbs' | 'kg') => {
    setFormData(prev => ({ ...prev, weight_unit: unit }))
    try {
      await updateSettings({ ...formData, weight_unit: unit })
    } catch { /* local state already switched; the next save retries the write */ }
  }

  // `err.message` here was the raw JS message — for an axios failure that reads
  // "Request failed with status code 400", which is true and tells the user nothing.
  const save = useAsyncAction(async () => {
    await updateSettings(formData)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }, 'Failed to save settings')

  const handleSave = () => {
    setSuccess(false)
    void save.run()
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
      <PageHeader title="Settings" subtitle="Preferences and account configuration" />

      {(error || save.error) && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || save.error}</span>
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
          <span className="text-sm text-tx-muted">{memberSince(user?.created_at)}</span>
        </SettingRow>
        <SettingRow label="Password" description="Changing it signs you out on your other devices">
          <Link to="/settings/password" className="btn-secondary btn-sm">
            <KeyRound className="w-3.5 h-3.5" /> Change
          </Link>
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

        <SettingRow label="Rest timer" description="Auto-start a countdown between sets in gym mode">
          <div className="flex gap-1 bg-surface-overlay rounded-lg p-1 border border-surface-border">
            {([['Off', false], ['On', true]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setRestEnabled(val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  (storedSettings.rest_enabled ?? true) === val
                    ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-sm'
                    : 'text-tx-muted hover:text-tx-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingRow>

        {(() => {
          const enabled = storedSettings.rest_enabled ?? true
          const presets = [60, 90, 120, 180]
          const cur = storedSettings.rest_seconds_default ?? 90
          const isCustom = !presets.includes(cur)
          const customActive = isCustom || showCustomRest
          const seg = (active: boolean) =>
            `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
              active ? 'bg-brand-500 text-white' : 'bg-surface-muted text-tx-secondary hover:text-tx-primary'
            }`
          return (
            <div className={`py-4 transition-opacity ${enabled ? '' : 'opacity-40 pointer-events-none select-none'}`} aria-disabled={!enabled}>
              <p className="text-sm font-medium text-tx-primary">Default rest</p>
              <p className="text-xs text-tx-muted mt-0.5 mb-3">Seeds new exercises · per-exercise rest overrides it</p>
              <div className="flex rounded-xl border border-surface-border overflow-hidden divide-x divide-surface-border">
                {presets.map(sec => (
                  <button key={sec} disabled={!enabled} onClick={() => { setShowCustomRest(false); setRestSeconds(sec) }} className={seg(!customActive && cur === sec)}>
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[11px] font-semibold leading-none">{sec}s</span>
                  </button>
                ))}
                <button disabled={!enabled} onClick={() => setShowCustomRest(true)} className={seg(customActive)}>
                  <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px] font-semibold leading-none">{isCustom ? `${cur}s` : 'Custom'}</span>
                </button>
              </div>
              {customActive && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button type="button" disabled={!enabled} aria-label="−5 seconds" onClick={() => setRestSeconds(Math.max(0, cur - 5))}
                    className="p-2.5 rounded-xl bg-surface-muted border border-surface-border text-tx-secondary active:scale-95 hover:text-tx-primary">
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      disabled={!enabled}
                      value={cur}
                      onChange={e => setRestSeconds(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
                      className="input w-28 text-center py-2.5 pr-9 text-base font-semibold tabular-nums"
                      aria-label="Custom rest seconds"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tx-muted pointer-events-none">sec</span>
                  </div>
                  <button type="button" disabled={!enabled} aria-label="+5 seconds" onClick={() => setRestSeconds(Math.min(3600, cur + 5))}
                    className="p-2.5 rounded-xl bg-surface-muted border border-surface-border text-tx-secondary active:scale-95 hover:text-tx-primary">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })()}
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
            disabled={save.busy}
            className="btn-primary btn-sm"
          >
            <Check className="w-3.5 h-3.5" /> {save.busy ? 'Saving...' : 'Save targets'}
          </button>
        </div>
      </Section>

      {/* Server info */}
      <Section title="Self-Hosted Instance">
        <SettingRow label="API server" description="Backend server this client is connected to">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0" />
            <span className="text-xs font-mono text-tx-muted">{serverUrl || 'This site (reverse proxy)'}</span>
          </div>
        </SettingRow>
        {/* #17: same Server Settings editor as the sign-in screens, so a logged-in
            user can repoint the client (or recover from a bad URL) without signing out. */}
        <div className="py-2">
          <ServerSettings />
        </div>
        <SettingRow label="Database" description="Storage backend">
          <span className="badge-dim">SQLite</span>
        </SettingRow>
        <SettingRow label="Version" description="lyftr backend version">
          <span className="text-xs text-tx-muted font-mono">{serverInfo?.version || '—'}</span>
        </SettingRow>
      </Section>

      {/* Exercise Library */}
      <Section title="Exercise Library">
        <SettingRow
          label="Exercise database"
          description="Exercises come from open-exercise-db, queried as you search. This server keeps a copy of the ones it has shown."
        >
          <span className="text-sm font-mono text-tx-muted">
            {cacheStatus ? cacheStatus.count.toLocaleString() : '—'} cached
          </span>
        </SettingRow>

        {seedMsg && (
          <div className="py-2 px-1">
            <p className="text-xs text-tx-muted">{seedMsg}</p>
          </div>
        )}

        <div className="py-3 flex items-center gap-2">
          <button
            onClick={handleRefreshCache}
            disabled={!!seedAction}
            className="btn-secondary btn-sm"
          >
            {seedAction === 'refresh'
              ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Refreshing...</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Refresh cached</>
            }
          </button>
          <button
            onClick={handleClearCache}
            disabled={!!seedAction}
            className="btn-secondary btn-sm"
          >
            {seedAction === 'clear'
              ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Clearing...</>
              : <><Trash2 className="w-3.5 h-3.5" /> Clear unused</>
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
