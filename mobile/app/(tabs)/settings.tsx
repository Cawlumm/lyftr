import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Dumbbell,
  LogOut,
  Mail,
  Minus,
  Moon,
  Plus,
  Scale,
  Server,
  Timer,
  Trash2,
} from 'lucide-react-native'
import { normalizeServerUrl, testServerConnection } from '@lyftr/shared'
import {
  AppText,
  Button,
  ConfirmSheet,
  Field,
  IconButton,
  Loading,
  Muted,
  NumberField,
  PageHeader,
  Screen,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  Toast,
  Toggle,
  type ToastVariant,
} from '../../src/components/ui'
import { client, useAuthStore, useServerStore, useSettingsStore } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const REST_PRESETS = [60, 90, 120, 180]

type ToastState = { variant: ToastVariant; title: string; description?: string }

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const serverUrl = useServerStore((s) => s.serverUrl)
  const setServerUrl = useServerStore((s) => s.setServerUrl)

  const settings = useSettingsStore((s) => s.settings)
  const loaded = useSettingsStore((s) => s.loaded)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const updateSettings = useSettingsStore((s) => s.update)
  const setWorkoutLayout = useSettingsStore((s) => s.setWorkoutLayout)
  const setRestEnabled = useSettingsStore((s) => s.setRestEnabled)
  const setRestSeconds = useSettingsStore((s) => s.setRestSeconds)

  const { mode, setMode, colors } = useTheme()

  const [toast, setToast] = useState<ToastState | null>(null)

  // Macro/calorie targets are the one batch-saved (server-side) block — mirror web:
  // edit locally as text, PUT on "Save". Everything else writes on change.
  const [targets, setTargets] = useState({ calorie_target: '', protein_target: '', carb_target: '', fat_target: '' })
  const [saving, setSaving] = useState(false)

  const [showCustomRest, setShowCustomRest] = useState(false)

  // Server repoint (same warn-but-save flow as the sign-in screens / web ServerSettings).
  const [urlInput, setUrlInput] = useState(serverUrl)
  const [serverMsg, setServerMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    setUrlInput(serverUrl)
  }, [serverUrl])

  // Seed the target inputs from the server-backed settings whenever they change (initial
  // load or a change synced from another device).
  useEffect(() => {
    setTargets({
      calorie_target: String(settings.calorie_target),
      protein_target: String(settings.protein_target),
      carb_target: String(settings.carb_target),
      fat_target: String(settings.fat_target),
    })
  }, [settings.calorie_target, settings.protein_target, settings.carb_target, settings.fat_target])

  const memberSince = useMemo(() => {
    if (!user?.created_at) return '—'
    const d = new Date(user.created_at)
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }, [user?.created_at])

  const restEnabled = settings.rest_enabled ?? true
  const restCur = settings.rest_seconds_default ?? 90
  const restIsCustom = !REST_PRESETS.includes(restCur)
  const restCustomActive = restIsCustom || showCustomRest

  const onDigits = (key: keyof typeof targets) => (t: string) =>
    setTargets((p) => ({ ...p, [key]: t.replace(/[^0-9]/g, '') }))

  const handleSaveTargets = async () => {
    setSaving(true)
    try {
      await updateSettings({
        calorie_target: parseInt(targets.calorie_target) || 0,
        protein_target: parseInt(targets.protein_target) || 0,
        carb_target: parseInt(targets.carb_target) || 0,
        fat_target: parseInt(targets.fat_target) || 0,
      })
      setToast({ variant: 'success', title: 'Targets saved' })
    } catch (err: any) {
      setToast({ variant: 'error', title: 'Could not save targets', description: err?.message })
    } finally {
      setSaving(false)
    }
  }

  const saveServer = async () => {
    setTesting(true)
    setServerMsg(null)
    const base = normalizeServerUrl(urlInput)
    if (urlInput.trim() && !base) {
      setServerMsg('Enter a full URL including http:// or https://')
      setTesting(false)
      return
    }
    // Warn-but-save: the choice is authoritative right away; the probe is advisory.
    await setServerUrl(base)
    const result = await testServerConnection(base)
    setServerMsg(result.ok ? `Connected · ${result.info.name} v${result.info.version}` : `Saved, but ${result.message}`)
    setTesting(false)
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      await client.userAPI.deleteAccount()
      // logout clears the token + user; the tab layout's auth guard redirects to sign-in.
      await logout()
    } catch (err: any) {
      setDeleting(false)
      setConfirmDelete(false)
      setToast({ variant: 'error', title: 'Could not delete account', description: err?.message })
    }
  }

  if (!loaded) return <Loading />

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-6 py-4">
          {/* Back — Settings is reached from the Home avatar (no longer a footer tab). */}
          <View className="gap-3">
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
              hitSlop={8}
              className="flex-row items-center gap-1.5 self-start active:opacity-60"
            >
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">Home</AppText>
            </Pressable>
            <PageHeader title="Settings" subtitle="Preferences and account configuration" />
          </View>

          {/* Account */}
          <SettingsGroup title="Account">
            <SettingsRow icon={Mail} label="Email" value={user?.email ?? '—'} />
            <SettingsRow icon={CalendarDays} label="Member since" value={memberSince} divider />
          </SettingsGroup>

          {/* Appearance */}
          <SettingsGroup title="Appearance">
            <SettingsRow
              icon={Moon}
              label="Dark mode"
              description="Use the dark color scheme"
              right={
                <Toggle
                  value={mode === 'dark'}
                  onValueChange={(on) => setMode(on ? 'dark' : 'light')}
                  accessibilityLabel="Dark mode"
                />
              }
            />
          </SettingsGroup>

          {/* Workout */}
          <SettingsGroup title="Workout" footnote="Default rest seeds new exercises · a per-exercise rest overrides it.">
            <SettingsRow
              icon={Dumbbell}
              label="Default workout view"
              below={
                <SegmentedControl
                  value={settings.workout_layout ?? 'list'}
                  onChange={setWorkoutLayout}
                  options={[
                    { value: 'list', label: 'List' },
                    { value: 'gym', label: 'Gym Mode' },
                  ]}
                />
              }
            />
            <SettingsRow
              icon={Timer}
              label="Rest timer"
              description="Auto-start a countdown between sets"
              divider
              right={
                <Toggle value={restEnabled} onValueChange={setRestEnabled} accessibilityLabel="Rest timer" />
              }
            />
            {/* Dependent sub-setting: shown but dimmed + inert when the timer is off (the value
                is preserved, matching web). */}
            <View pointerEvents={restEnabled ? 'auto' : 'none'} style={{ opacity: restEnabled ? 1 : 0.4 }}>
              <SettingsRow
                icon={Clock}
                label="Default rest"
                divider
                below={
                  <View className="gap-3">
                    <SegmentedControl
                      value={restCustomActive ? 'custom' : String(restCur)}
                      onChange={(v) => {
                        if (v === 'custom') {
                          setShowCustomRest(true)
                        } else {
                          setShowCustomRest(false)
                          setRestSeconds(Number(v))
                        }
                      }}
                      options={[
                        ...REST_PRESETS.map((s) => ({ value: String(s), label: `${s}s` })),
                        { value: 'custom', label: restIsCustom ? `${restCur}s` : 'Custom' },
                      ]}
                    />
                    {restCustomActive ? (
                      <View className="flex-row items-center justify-center gap-3">
                        <IconButton
                          icon={Minus}
                          label="Decrease rest by 5 seconds"
                          variant="secondary"
                          size="md"
                          onPress={() => setRestSeconds(Math.max(0, restCur - 5))}
                        />
                        <View className="w-28 flex-row items-center justify-center gap-1 rounded-xl border border-surface-border bg-surface-overlay py-1">
                          <Clock size={13} color={colors.txMuted} />
                          <View className="w-16">
                            <NumberField
                              value={String(restCur)}
                              onChange={(v) => setRestSeconds(Math.max(0, Math.min(3600, Number(v) || 0)))}
                              inputMode="numeric"
                              accessibilityLabel="Custom rest seconds"
                            />
                          </View>
                        </View>
                        <IconButton
                          icon={Plus}
                          label="Increase rest by 5 seconds"
                          variant="secondary"
                          size="md"
                          onPress={() => setRestSeconds(Math.min(3600, restCur + 5))}
                        />
                      </View>
                    ) : null}
                  </View>
                }
              />
            </View>
          </SettingsGroup>

          {/* Units & Targets */}
          <SettingsGroup title="Units & Targets" footnote="Weight unit applies instantly across the app. Nutrition targets power the dashboard rings.">
            <SettingsRow
              icon={Scale}
              label="Weight unit"
              below={
                <SegmentedControl
                  value={settings.weight_unit}
                  onChange={(u) => updateSettings({ weight_unit: u })}
                  options={[
                    { value: 'lbs', label: 'lbs' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
              }
            />
            <View className="gap-3 border-t border-surface-border py-4">
              <Field
                label="Calorie target"
                keyboardType="number-pad"
                value={targets.calorie_target}
                onChangeText={onDigits('calorie_target')}
                rightSlot={<Muted className="text-xs">kcal</Muted>}
              />
              <Field
                label="Protein target"
                keyboardType="number-pad"
                value={targets.protein_target}
                onChangeText={onDigits('protein_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Field
                label="Carb target"
                keyboardType="number-pad"
                value={targets.carb_target}
                onChangeText={onDigits('carb_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Field
                label="Fat target"
                keyboardType="number-pad"
                value={targets.fat_target}
                onChangeText={onDigits('fat_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Button title="Save targets" onPress={handleSaveTargets} loading={saving} className="mt-1" />
            </View>
          </SettingsGroup>

          {/* Server */}
          <SettingsGroup title="Server" footnote="The self-hosted backend this app talks to. Leave the URL blank to use the default.">
            <SettingsRow
              icon={Server}
              label="Backend"
              right={
                <View className="max-w-[60%] flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-success-500" />
                  <AppText variant="body" color="muted" numberOfLines={1}>
                    {serverUrl || 'Default backend'}
                  </AppText>
                </View>
              }
            />
            <View className="border-t border-surface-border py-4">
              <Field
                label="Server URL"
                value={urlInput}
                onChangeText={setUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://your-server.example.com"
              />
              {serverMsg ? <AppText variant="caption" className="mt-2 text-brand-400">{serverMsg}</AppText> : null}
              <Button title="Test & save" variant="secondary" onPress={saveServer} loading={testing} className="mt-3" />
            </View>
          </SettingsGroup>

          {/* Account actions */}
          <SettingsGroup title="Account actions">
            <SettingsRow icon={LogOut} tint="muted" label="Sign out" onPress={() => logout()} chevron />
            <SettingsRow
              icon={Trash2}
              label="Delete account"
              description="Permanently delete all your data"
              destructive
              divider
              onPress={() => setConfirmDelete(true)}
            />
          </SettingsGroup>
        </View>
      </ScrollView>

      {toast ? (
        <Toast
          variant={toast.variant}
          title={toast.title}
          description={toast.description}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <ConfirmSheet
        open={confirmDelete}
        icon={Trash2}
        destructive
        title="Delete account?"
        message="This permanently deletes your account and all of your data. This can't be undone."
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  )
}
