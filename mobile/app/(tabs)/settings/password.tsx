import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft, ShieldCheck } from 'lucide-react-native'
import { apiErrorMessage, differentRuleLabel, lengthRuleLabel, matchRuleLabel, newPasswordRules } from '@lyftr/shared'
import {
  Alert,
  AppText,
  Button,
  Card,
  PageHeader,
  PasswordField,
  PasswordRule,
  Screen,
} from '../../../src/components/ui'
import { client } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Its own screen rather than a panel inside Settings, matching web's /settings/password.
// Web needs the route so /.well-known/change-password has somewhere to redirect; mobile
// follows so the two platforms stay one flow, and so this becomes deep-linkable if app
// links are ever added.
//
// Laid out beat for beat with that page — back link, header, the form on a card, and a
// centred confirmation card on success — so the two do not merely do the same thing, they
// read as the same screen.
export default function ChangePasswordScreen() {
  const { colors, brand } = useTheme()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const rules = newPasswordRules({ password: next, confirm, current })

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'))

  const submit = async () => {
    setError(null)
    // The rules render under the fields as the user types and the button stays disabled
    // until they pass, so this is a backstop. The alert below is server failures only —
    // a wrong current password, or a change that landed elsewhere first.
    if (!rules.ready) return

    setSaving(true)
    try {
      // The shared client persists the returned token pair, so this device stays signed
      // in while every other one is evicted.
      await client.userAPI.changePassword({ current_password: current, new_password: next })
      setCurrent(''); setNext(''); setConfirm('')
      setDone(true)
    } catch (err: any) {
      setError(apiErrorMessage(err, "Couldn't change your password. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  const backLink = (
    <Pressable
      onPress={back}
      hitSlop={8}
      className="flex-row items-center gap-1.5 self-start active:opacity-60"
    >
      <ArrowLeft size={16} color={colors.txMuted} />
      <AppText variant="body" color="muted">Settings</AppText>
    </Pressable>
  )

  // Success replaces the form rather than sitting above it. Three filled-looking boxes
  // under a success banner invite a second submit that could only fail — the current
  // password is no longer current. The card carries its own heading, so the page header
  // is dropped here rather than saying the same words twice.
  if (done) {
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-5 py-4">
            {backLink}
            <Card className="items-center gap-3 p-6">
              <View className="h-12 w-12 items-center justify-center rounded-full border border-success-500/20 bg-success-500/10">
                <ShieldCheck size={24} color={brand.successSoft} strokeWidth={2.2} />
              </View>
              <View className="gap-1">
                <AppText variant="title" className="text-center">Password changed</AppText>
                <AppText variant="body" color="muted" className="text-center">
                  You are still signed in here. Every other device has been signed out and
                  will need the new password.
                </AppText>
              </View>
              <Button title="Back to settings" variant="secondary" onPress={back} className="mt-1" />
            </Card>
          </View>
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-5 py-4">
          {backLink}
          <PageHeader
            title="Change password"
            subtitle="You will stay signed in here. Every other device is signed out."
          />

          <Card className="gap-4">
            <PasswordField
              label="Current password"
              value={current}
              onChangeText={setCurrent}
              textContentType="password"
            />
            {/* newPassword lets the OS keychain offer to generate and save one, and stops
                it filing the new value under the old password's entry. */}
            <PasswordField
              label="New password"
              value={next}
              onChangeText={setNext}
              textContentType="newPassword"
            >
              <PasswordRule state={rules.length}>{lengthRuleLabel()}</PasswordRule>
              <PasswordRule state={rules.different}>{differentRuleLabel()}</PasswordRule>
            </PasswordField>
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              textContentType="newPassword"
            >
              <PasswordRule state={rules.match}>{matchRuleLabel(rules.match)}</PasswordRule>
            </PasswordField>

            {/* Form-level, so it belongs beside the action it blocked rather than hanging
                off one field — pinning it to the confirm box pointed the user at the wrong
                input for an error about the current password. */}
            {error ? <Alert variant="error">{error}</Alert> : null}

            <View className="flex-row gap-2">
              <Button
                title="Update password"
                onPress={submit}
                loading={saving}
                disabled={!rules.ready}
                className="flex-1"
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={back}
                disabled={saving}
                className="flex-1"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  )
}
