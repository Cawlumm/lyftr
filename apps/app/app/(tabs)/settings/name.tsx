import { useState } from 'react'
import { router } from 'expo-router'
import { useAsyncAction, useTranslation, displayName, MAX_DISPLAY_NAME_LEN } from '@lyftr/shared'
import { AppText, Card, FormField, FormPage, Muted, useDiscardGuard } from '../../../src/components/ui'
import { useAuthStore, useSettingsStore } from '../../../src/lib/lyftr'

// Returns to Settings with no confirmation, and that is the rule rather than an
// exception: a save is confirmed in proportion to its CONSEQUENCE, not to the shape of
// the screen it happened on.
//
//   password.tsx  stays and shows a card — changing it signs you out everywhere, which
//                 is a consequence worth spelling out in words
//   targets       stays and toasts — it saves in place, so nothing on screen changes
//                 to show that anything happened
//   here          pops back to a row already showing the new value, and a name has no
//                 consequence to warn anyone about
//
// So a new settings editor should ask what its save COSTS the person, not which of
// these three screens it most resembles.
function NameField({ value, onChange, onSubmit, placeholder }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string }) {
  const { t } = useTranslation()
  return (
    <Card className="gap-4">
      {/* No visible label — the header says "Name" above — but it still needs an accessible
          one, or a screen reader announces only the email placeholder, as if that were the
          current value. */}
      <FormField
        accessibilityLabel={t('settings.account.name.label')}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        maxLength={MAX_DISPLAY_NAME_LEN}
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      <Muted className="text-xs">{t('settings.account.name.emptyHint')}</Muted>
    </Card>
  )
}

export default function ChangeNameScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)

  const saved = settings.display_name ?? ''
  const [name, setName] = useState(saved)
  const changed = name.trim() !== saved
  const guard = useDiscardGuard(changed)

  // Trimmed before sending so the field agrees with what comes back — the server trims
  // too, and a field left holding "  Carter  " would show a value the record does not have.
  const save = useAsyncAction(async () => {
    await updateSettings({ display_name: name.trim() })
    guard.allowLeave()
    if (router.canGoBack()) router.back()
    else router.navigate('/settings')
  }, t('settings.account.name.saveFailedRetry'))

  return (
    <FormPage
      title={t('settings.account.name.title')}
      subtitle={<AppText variant="caption" color="muted" className="mt-0.5">{t('settings.account.name.subtitle')}</AppText>}
      fallback="/settings"
      guard={guard}
      error={save.error}
      primary={{ label: t('common.save'), onPress: () => { void save.run() }, busy: save.busy, disabled: !changed }}
    >
      <NameField
        value={name}
        onChange={setName}
        placeholder={displayName('', user?.email)}
        onSubmit={() => { if (!save.busy && changed) void save.run() }}
      />
    </FormPage>
  )
}
