import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useTheme } from '../hooks/useTheme'
import { exerciseAPI } from '../services/api'
import { SUPPORTED_LANGUAGES } from '../i18n'
import * as types from '../types'
import { HelpTip } from '../components/Tooltip'
import PageHeader from '../components/ui/PageHeader'
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
  const { t, i18n } = useTranslation()
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
        setError(err.message || t('settings.loadError'))
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
      setSeedMsg(t('settings.exercises.synced', { count: res.total }))
      loadSeedStatus()
    } catch (err: any) {
      setSeedMsg(err.message || t('settings.exercises.syncFailed'))
    } finally {
      setSeedAction(null)
    }
  }

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng)
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
      setError(err.message || t('settings.saveError'))
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
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-success">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{t('settings.saveSuccess')}</span>
        </div>
      )}

      {/* Account */}
      <Section title={t('settings.account.title')}>
        <SettingRow label={t('settings.account.email')} description={t('settings.account.emailDesc')}>
          <span className="text-sm text-tx-muted font-mono">{user?.email}</span>
        </SettingRow>
        <SettingRow label={t('settings.account.memberSince')}>
          <span className="text-sm text-tx-muted">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) : '—'}
          </span>
        </SettingRow>
      </Section>

      {/* Appearance */}
      <Section title={t('settings.appearance.title')}>
        <SettingRow label={t('settings.appearance.theme')} description={t('settings.appearance.themeDesc')}>
          <button onClick={toggleTheme} className="btn-secondary btn-sm">
            {theme === 'dark'
              ? <><Moon className="w-3.5 h-3.5" /> {t('settings.appearance.dark')}</>
              : <><Sun className="w-3.5 h-3.5" /> {t('settings.appearance.light')}</>
            }
          </button>
        </SettingRow>
        <SettingRow label={t('settings.appearance.language')} description={t('settings.appearance.languageDesc')}>
          <select
            value={i18n.resolvedLanguage}
            onChange={e => handleLanguageChange(e.target.value)}
            className="input btn-sm py-1.5 pr-8"
          >
            {SUPPORTED_LANGUAGES.map(lng => (
              <option key={lng.code} value={lng.code}>{lng.label}</option>
            ))}
          </select>
        </SettingRow>
      </Section>

      {/* Workout */}
      <Section title={t('settings.workout.title')}>
        <SettingRow label={t('settings.workout.layout')} description={t('settings.workout.layoutDesc')}>
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
                {mode === 'list' ? t('settings.workout.list') : t('settings.workout.gym')}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* Goals & Units */}
      <Section title={t('settings.goals.title')}>
        <SettingRow label={t('settings.goals.weightUnit')} description={t('settings.goals.weightUnitDesc')}>
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

        <SettingRow label={t('settings.goals.calorieTarget')} description={t('settings.goals.calorieTargetDesc')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.calorie_target}
              onChange={e => setFormData({ ...formData, calorie_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
              min={500}
              max={10000}
            />
            <span className="text-xs text-tx-muted">{t('settings.goals.kcal')}</span>
          </div>
        </SettingRow>

        <SettingRow label={t('settings.goals.proteinTarget')} description={t('settings.goals.proteinTargetDesc')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.protein_target}
              onChange={e => setFormData({ ...formData, protein_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">{t('settings.goals.grams')}</span>
          </div>
        </SettingRow>

        <SettingRow label={t('settings.goals.carbTarget')} description={t('settings.goals.carbTargetDesc')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.carb_target}
              onChange={e => setFormData({ ...formData, carb_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">{t('settings.goals.grams')}</span>
          </div>
        </SettingRow>

        <SettingRow label={t('settings.goals.fatTarget')} description={t('settings.goals.fatTargetDesc')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.fat_target}
              onChange={e => setFormData({ ...formData, fat_target: parseInt(e.target.value) || 0 })}
              className="input w-24 text-right"
            />
            <span className="text-xs text-tx-muted">{t('settings.goals.grams')}</span>
          </div>
        </SettingRow>

        <div className="py-3 flex items-center justify-between">
          <p className="text-xs text-tx-muted">{t('settings.goals.saveHint')}</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary btn-sm"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? t('settings.goals.saving') : t('settings.goals.save')}
          </button>
        </div>
      </Section>

      {/* Server info */}
      <Section title={t('settings.instance.title')}>
        <SettingRow label={t('settings.instance.apiServer')} description={t('settings.instance.apiServerDesc')}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0" />
            <span className="text-xs font-mono text-tx-muted">localhost:3000</span>
          </div>
        </SettingRow>
        <SettingRow label={t('settings.instance.database')} description={t('settings.instance.databaseDesc')}>
          <span className="badge-dim">SQLite</span>
        </SettingRow>
        <SettingRow label={t('settings.instance.version')} description={t('settings.instance.versionDesc')}>
          <span className="text-xs text-tx-muted font-mono">{t('common.version')}</span>
        </SettingRow>
      </Section>

      {/* Exercise Library */}
      <Section title={t('settings.exercises.title')}>
        <SettingRow
          label={t('settings.exercises.database')}
          description={t('settings.exercises.databaseDesc')}
        >
          <div className="flex items-center gap-2">
            {seedStatus?.in_progress ? (
              <span className="flex items-center gap-1.5 text-xs text-brand-400">
                <Loader className="w-3.5 h-3.5 animate-spin" /> {t('settings.exercises.seeding')}
              </span>
            ) : (
              <span className="text-sm font-mono text-tx-muted">
                {seedStatus ? t('settings.exercises.count', { count: seedStatus.count }) : '—'}
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
              ? <><Loader className="w-3.5 h-3.5 animate-spin" /> {t('settings.exercises.syncing')}</>
              : <><RefreshCw className="w-3.5 h-3.5" /> {t('settings.exercises.resync')}</>
            }
          </button>
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title={t('settings.danger.title')}>
        <SettingRow label={t('settings.danger.signOut')} description={t('settings.danger.signOutDesc')}>
          <button onClick={() => logout()} className="btn-secondary btn-sm">
            <LogOut className="w-3.5 h-3.5" /> {t('settings.danger.signOut')}
          </button>
        </SettingRow>
        <SettingRow label={t('settings.danger.deleteAccount')} description={t('settings.danger.deleteAccountDesc')}>
          <button className="btn-danger btn-sm">
            <Trash2 className="w-3.5 h-3.5" /> {t('settings.danger.delete')}
          </button>
        </SettingRow>
      </Section>
    </div>
  )
}
