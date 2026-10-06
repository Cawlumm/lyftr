import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useAsyncAction, displayName, MAX_DISPLAY_NAME_LEN } from '@lyftr/shared'
import {
  Alert,
  AppText,
  Button,
  Card,
  Field,
  Muted,
  PageHeader,
  Screen,
} from '../../../src/components/ui'
import { useAuthStore, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Its own screen, laid out like password.tsx — back link, header, form on a card, Save
// beside Cancel. Account rows are icon + label + value, so an editor belongs here rather
// than as a form wedged into that group.
export default function ChangeNameScreen() {
  const { colors } = useTheme()
  const user = useAuthStore((s) => s.user)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)

  const [name, setName] = useState(settings.display_name ?? '')

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'))

  // Trimmed before sending so the field agrees with what comes back — the server trims
  // too, and a field left holding "  Carter  " would show a value the record does not have.
  //
  // No success toast, unlike "Targets saved" next door, and no confirmation card like
  // password.tsx. Those two need one because they save in place: the screen after a
  // successful save looks identical to the screen before it. This one returns to a row
  // showing the new value, which is the result itself rather than a message about it.
  const save = useAsyncAction(async () => {
    await updateSettings({ display_name: name.trim() })
    back()
  }, "Couldn't save your name. Please try again.")

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-5 py-4">
          <Pressable
            onPress={back}
            hitSlop={8}
            className="flex-row items-center gap-1.5 self-start active:opacity-60"
          >
            <ArrowLeft size={16} color={colors.txMuted} />
            <AppText variant="body" color="muted">Settings</AppText>
          </Pressable>

          <PageHeader
            title="Name"
            subtitle="The name the app greets you by."
          />

          <Card className="gap-4">
            {/* No visible label — the header says "Name" one line above — but it still
                needs an accessible one, or a screen reader announces only the email
                placeholder, as if that were the current value. */}
            <Field
              accessibilityLabel="Name"
              placeholder={displayName('', user?.email)}
              value={name}
              onChangeText={setName}
              maxLength={MAX_DISPLAY_NAME_LEN}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { if (!save.busy) void save.run() }}
            />
            <Muted className="text-xs">
              Leave it empty and we&apos;ll use your email instead.
            </Muted>

            {save.error ? <Alert variant="error">{save.error}</Alert> : null}

            <View className="flex-row gap-2">
              <Button
                title="Save"
                onPress={() => void save.run()}
                loading={save.busy}
                disabled={name.trim() === (settings.display_name ?? '')}
                className="flex-1"
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={back}
                disabled={save.busy}
                className="flex-1"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  )
}
