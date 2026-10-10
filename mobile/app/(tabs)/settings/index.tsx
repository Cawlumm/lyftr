import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  AlertTriangle,
  Dumbbell,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  Minus,
  Moon,
  Plus,
  Scale,
  Server,
  Timer,
  Trash2,
  User,
} from 'lucide-react-native'
import { useAsyncAction,
  useTranslation,
  i18n,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  memberSince,
  normalizeServerUrl,
  testServerConnection,
  isInsecureServerUrl,
  INSECURE_SERVER_WARNING,
  sanitizeNumericInput,
} from '@lyftr/shared'
import {
  AppText,
  Button,
  ConfirmSheet,
  ErrorState,
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
} from '../../../src/components/ui'
import { client, useAuthStore, useDisplayName, useLanguageStore, useServerStore, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

const REST_PRESETS = [60, 90, 120, 180]

type ToastState = { variant: ToastVariant; title: string; description?: string }

export default function SettingsScreen() {
  const { t } = useTranslation()
  const preference = useLanguageStore((s) => s.preference)
  const setPreference = useLanguageStore((s) => s.setPreference)
  const user = useAuthStore((s) => s.user)
  const name = useDisplayName()
  const logout = useAuthStore((s) => s.logout)
  const serverUrl = useServerStore((s) => s.serverUrl)
  const setServerUrl = useServerStore((s) => s.setServerUrl)

  const settings = useSettingsStore((s) => s.settings)
  const loaded = useSettingsStore((s) => s.loaded)
  // True when `loaded` is standing on defaults because the read failed. Only the
  // server-backed block is gated on it: theme, layout, rest timer and the backend URL
  // are device-side, and the URL row is the very control someone needs WHEN the
  // server cannot be reached.
  const settingsLoadFailed = useSettingsStore((s) => s.loadFailed)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const updateSettings = useSettingsStore((s) => s.update)
  const setWorkoutLayout = useSettingsStore((s) => s.setWorkoutLayout)
  const setRestEnabled = useSettingsStore((s) => s.setRestEnabled)
  const setRestSeconds = useSettingsStore((s) => s.setRestSeconds)

  const { mode, setMode, colors, brand } = useTheme()

  const [toast, setToast] = useState<ToastState | null>(null)

  // Macro/calorie targets are the one batch-saved (server-side) block — mirror web:
  // edit locally as text, PUT on "Save". Everything else writes on change.
  const [targets, setTargets] = useState({ calorie_target: '', protein_target: '', carb_target: '', fat_target: '' })

  const [showCustomRest, setShowCustomRest] = useState(false)

  // Server repoint (same warn-but-save flow as the sign-in screens / web ServerSettings).
  const [urlInput, setUrlInput] = useState(serverUrl)
  const insecureServer = isInsecureServerUrl(serverUrl)
  const [serverMsg, setServerMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const restEnabled = settings.rest_enabled ?? true
  const restCur = settings.rest_seconds_default ?? 90
  const restIsCustom = !REST_PRESETS.includes(restCur)
  const restCustomActive = restIsCustom || showCustomRest

  const onDigits = (key: keyof typeof targets) => (t: string) =>
    setTargets((p) => ({ ...p, [key]: sanitizeNumericInput(t, 'numeric') }))

  const saveTargets = useAsyncAction(async () => {
    await updateSettings({
      calorie_target: parseInt(targets.calorie_target) || 0,
      protein_target: parseInt(targets.protein_target) || 0,
      carb_target: parseInt(targets.carb_target) || 0,
      fat_target: parseInt(targets.fat_target) || 0,
    })
    setToast({ variant: 'success', title: t('settings.unitsTargets.saved') })
  }, t('settings.targets.saveFailed'))

  const handleSaveTargets = () => { void saveTargets.run() }

  // The unit toggle used to call updateSettings() bare, so a failed PUT was a floating
  // rejection: nothing told the user, and the app kept showing the unit the server had
  // refused until the next launch quietly flipped it back. The store rolls the value
  // back now; this is what says why.
  const changeUnit = useAsyncAction(async (unit: 'lbs' | 'kg') => {
    await updateSettings({ weight_unit: unit })
  }, t('settings.targets.weightUnit.changeFailedFallback'))

  const saveServer = async () => {
    setTesting(true)
    setServerMsg(null)
    const base = normalizeServerUrl(urlInput)
    if (urlInput.trim() && !base) {
      setServerMsg(t('settings.server.url.invalid'))
      setTesting(false)
      return
    }
    // Warn-but-save: the choice is authoritative right away; the probe is advisory.
    await setServerUrl(base)
    const result = await testServerConnection(base)
    setServerMsg(result.ok
      ? t('settings.server.connected', { name: result.info.name, version: result.info.version })
      : t('settings.server.savedWithWarning', { message: result.message }))
    setTesting(false)
  }

  const deleteAccount = useAsyncAction(async () => {
    await client.userAPI.deleteAccount()
    // logout flips isAuthenticated; the root layout's Stack.Protected guard then makes
    // (tabs) unreachable and expo-router moves the user to sign-in. Nothing routes by hand.
    await logout()
  }, t('settings.deleteAccount.failed'))

  // These two report through the toast rather than an inline alert, so the message is
  // read off the hook when it changes. It used to be `err?.message`, which for an axios
  // error is the string "Request failed with status code 400" - true, and useless.
  useEffect(() => {
    if (saveTargets.error) setToast({ variant: 'error', title: t('settings.targets.saveFailed'), description: saveTargets.error })
  }, [saveTargets.error])

  useEffect(() => {
    if (changeUnit.error) setToast({ variant: 'error', title: t('settings.unitsTargets.changeUnitFailedTitle'), description: changeUnit.error })
  }, [changeUnit.error])

  useEffect(() => {
    if (deleteAccount.error) {
      setConfirmDelete(false)
      setToast({ variant: 'error', title: t('settings.deleteAccount.failed'), description: deleteAccount.error })
    }
  }, [deleteAccount.error])

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
              <AppText variant="body" color="muted">{t('settings.back')}</AppText>
            </Pressable>
            <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
          </View>

          {/* Account */}
          <SettingsGroup title={t('settings.account.title')}>
            {/* Shows what the greeting will actually say, so the fallback is visible
                without opening anything: the email's local part until a name is set.
                SettingsRow truncates its value to one line, which the dashboard heading
                deliberately does not — a row is a fixed-height nav affordance and the
                full name is one tap away, where the heading IS the content. */}
            <SettingsRow
              icon={User}
              label={t('settings.account.name.label')}
              value={name}
              chevron
              onPress={() => router.push('/settings/name')}
            />
            <SettingsRow
              icon={Mail}
              label={t('settings.account.email.label')}
              value={user?.email ?? '—'}
              divider
              chevron
              onPress={() => router.push('/settings/email')}
            />
            <SettingsRow icon={CalendarDays} label={t('settings.account.memberSince.label')} value={memberSince(user?.created_at, i18n.language)} divider />
            <SettingsRow
              icon={KeyRound}
              label={t('settings.account.password.label')}
              description={t('settings.account.password.description')}
              divider
              chevron
              onPress={() => router.push('/settings/password')}
            />
          </SettingsGroup>

          {/* Appearance */}
          <SettingsGroup title={t('settings.appearance.title')}>
            <SettingsRow
              icon={Moon}
              label={t('settings.appearance.darkMode.label')}
              description={t('settings.appearance.darkMode.description')}
              right={
                <Toggle
                  value={mode === 'dark'}
                  onValueChange={(on) => setMode(on ? 'dark' : 'light')}
                  accessibilityLabel={t('settings.appearance.darkMode.label')}
                />
              }
            />
            <SettingsRow
              icon={Languages}
              label={t('settings.language.label')}
              divider
              below={
                <SegmentedControl
                  value={preference}
                  onChange={(v) => { void setPreference(v) }}
                  options={[
                    { value: 'system', label: t('settings.language.system') },
                    ...SUPPORTED_LANGUAGES.map((c) => ({ value: c, label: LANGUAGE_NAMES[c] })),
                  ]}
                />
              }
            />
          </SettingsGroup>

          {/* Workout */}
          <SettingsGroup title={t('settings.workout.title')} footnote={t('settings.workout.footnote')}>
            <SettingsRow
              icon={Dumbbell}
              label={t('settings.workout.defaultView.label')}
              below={
                <SegmentedControl
                  value={settings.workout_layout ?? 'list'}
                  onChange={setWorkoutLayout}
                  options={[
                    { value: 'list', label: t('settings.workout.layout.list') },
                    { value: 'gym', label: t('settings.workout.layout.gym') },
                  ]}
                />
              }
            />
            <SettingsRow
              icon={Timer}
              label={t('settings.workout.restTimer.label')}
              description={t('settings.workout.restTimer.description')}
              divider
              right={
                <Toggle value={restEnabled} onValueChange={setRestEnabled} accessibilityLabel={t('settings.workout.restTimer.label')} />
              }
            />
            {/* Dependent sub-setting: shown but dimmed + inert when the timer is off (the value
                is preserved, matching web). */}
            <View pointerEvents={restEnabled ? 'auto' : 'none'} style={{ opacity: restEnabled ? 1 : 0.4 }}>
              <SettingsRow
                icon={Clock}
                label={t('settings.workout.defaultRest.label')}
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
                        ...REST_PRESETS.map((s) => ({ value: String(s), label: t('settings.workout.defaultRest.preset', { seconds: s }) })),
                        { value: 'custom', label: restIsCustom ? t('settings.workout.defaultRest.preset', { seconds: restCur }) : t('settings.workout.defaultRest.custom') },
                      ]}
                    />
                    {restCustomActive ? (
                      <View className="flex-row items-center justify-center gap-3">
                        <IconButton
                          icon={Minus}
                          label={t('settings.workout.defaultRest.decrease')}
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
                              accessibilityLabel={t('settings.workout.defaultRest.customLabel')}
                            />
                          </View>
                        </View>
                        <IconButton
                          icon={Plus}
                          label={t('settings.workout.defaultRest.increase')}
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

          {/* Units & Targets — the only server-backed, editable block on this screen.

              Withheld rather than filled with defaults: the store falls back to
              2000/150/250/65 so the rest of the app keeps working, and Save would PUT
              those straight over the user's real targets. */}
          {settingsLoadFailed ? (
            <SettingsGroup title={t('settings.unitsTargets.title')}>
              <ErrorState
                size="section"
                title={t('settings.targets.loadFailedTitle')}
                message={t('settings.unitsTargets.loadFailedMessage')}
                onRetry={() => { void fetchSettings() }}
              />
            </SettingsGroup>
          ) : (
          <SettingsGroup title={t('settings.unitsTargets.title')} footnote={t('settings.unitsTargets.footnote')}>
            <SettingsRow
              icon={Scale}
              label={t('settings.targets.weightUnit.label')}
              below={
                <SegmentedControl
                  value={settings.weight_unit}
                  onChange={(u) => { void changeUnit.run(u) }}
                  options={[
                    { value: 'lbs', label: 'lbs' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
              }
            />
            <View className="gap-3 border-t border-surface-border py-4">
              <Field
                label={t('settings.targets.calorie.label')}
                keyboardType="number-pad"
                value={targets.calorie_target}
                onChangeText={onDigits('calorie_target')}
                rightSlot={<Muted className="text-xs">kcal</Muted>}
              />
              <Field
                label={t('settings.targets.protein.label')}
                keyboardType="number-pad"
                value={targets.protein_target}
                onChangeText={onDigits('protein_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Field
                label={t('settings.targets.carb.label')}
                keyboardType="number-pad"
                value={targets.carb_target}
                onChangeText={onDigits('carb_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Field
                label={t('settings.targets.fat.label')}
                keyboardType="number-pad"
                value={targets.fat_target}
                onChangeText={onDigits('fat_target')}
                rightSlot={<Muted className="text-xs">g</Muted>}
              />
              <Button title={t('settings.targets.save')} onPress={handleSaveTargets} loading={saveTargets.busy} className="mt-1" />
            </View>
          </SettingsGroup>
          )}

          {/* Server */}
          <SettingsGroup title={t('settings.server.title')} footnote={t('settings.server.footnote')}>
            <SettingsRow
              icon={Server}
              label={t('settings.server.backend.label')}
              right={
                <View className="max-w-[60%] flex-row items-center gap-2">
                  {/* Amber, not green, whenever traffic leaves the device unencrypted (#79). */}
                  {insecureServer
                    ? <AlertTriangle size={13} color={brand.warning} strokeWidth={2.4} />
                    : <View className="h-1.5 w-1.5 rounded-full bg-success-500" />}
                  <AppText variant="body" color={insecureServer ? 'warning' : 'muted'} numberOfLines={1}>
                    {serverUrl || t('settings.server.backend.default')}
                  </AppText>
                </View>
              }
            />
            <View className="border-t border-surface-border py-4">
              <Field
                label={t('settings.server.url.label')}
                value={urlInput}
                onChangeText={setUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={t('settings.server.url.placeholder')}
              />
              {serverMsg ? <AppText variant="caption" color="brand" className="mt-2">{serverMsg}</AppText> : null}
              {insecureServer ? (
                <View className="mt-2 flex-row items-start gap-1.5">
                  <AlertTriangle size={13} color={brand.warning} strokeWidth={2.4} style={{ marginTop: 1 }} />
                  <AppText variant="caption" color="warning" className="flex-1">
                    {INSECURE_SERVER_WARNING}
                  </AppText>
                </View>
              ) : null}
              <Button title={t('settings.server.url.testAndSave')} variant="secondary" onPress={saveServer} loading={testing} className="mt-3" />
            </View>
          </SettingsGroup>

          {/* Account actions */}
          <SettingsGroup title={t('settings.danger.actionsTitle')}>
            <SettingsRow icon={LogOut} tint="muted" label={t('settings.signOut.label')} onPress={() => logout()} chevron />
            <SettingsRow
              icon={Trash2}
              label={t('settings.deleteAccount.label')}
              description={t('settings.deleteAccount.description')}
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
        title={t('settings.deleteAccount.sheetTitle')}
        message={t('settings.deleteAccount.sheetMessage')}
        confirmLabel={t('settings.deleteAccount.confirm')}
        busyLabel={t('settings.deleteAccount.busy')}
        busy={deleteAccount.busy}
        onConfirm={() => { void deleteAccount.run() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  )
}
