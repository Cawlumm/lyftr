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

// Its own screen, laid out beat for beat with password.tsx — back link, header, the form
// on a card, Save beside Cancel.
//
// It began as a field and a button sitting inside the Account group, which made that card
// a form stacked on top of three rows: no icon where its neighbours all have one, a help
// sentence that stayed forever, and a Save button parked permanently for something a
// person edits roughly once. Account rows are icon + label + value, and "change a thing
// about your account" already had an answer here in Password. This follows it, so the
// group is four rows that read alike and the form only exists while it is being used.
export default function ChangeNameScreen() {
  const { colors } = useTheme()
  const user = useAuthStore((s) => s.user)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)

  const [name, setName] = useState(settings.display_name ?? '')

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'))

  // Trimmed before sending so the field agrees with what comes back — the server trims
  // too, and a field left holding "  Carter  " would show a value the record does not have.
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
            subtitle="What the app calls you on your dashboard."
          />

          <Card className="gap-4">
            {/* No label on the field: the page header already says "Name" one line
                above it, and password.tsx only labels its inputs because it has three
                of them to tell apart. */}
            <Field
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
            {/* The placeholder already shows what the fallback would be, so this says what
                clearing it does rather than repeating the value. */}
            <Muted className="text-xs">
              Leave it empty and we&apos;ll use your email instead.
            </Muted>

            {save.error ? <Alert variant="error">{save.error}</Alert> : null}

            <View className="flex-row gap-2">
              <Button
                title="Save"
                onPress={() => void save.run()}
                loading={save.busy}
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
