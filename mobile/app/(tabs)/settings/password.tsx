import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { AlertTriangle, ArrowLeft, Check } from 'lucide-react-native'
import { apiErrorMessage } from '@lyftr/shared'
import {
  AppText,
  Button,
  Field,
  Muted,
  PageHeader,
  Screen,
} from '../../../src/components/ui'
import { client } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Mirrors the backend's min=8 so the obvious mistake costs no round trip. The server
// still enforces it — this only saves the request.
const MIN_PASSWORD = 8

// Its own screen rather than a panel inside Settings, matching web's /settings/password.
// Web needs the route so /.well-known/change-password has somewhere to redirect; mobile
// follows so the two platforms stay one flow, and so this becomes deep-linkable if app
// links are ever added.
export default function ChangePasswordScreen() {
  const { colors, brand } = useTheme()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'))

  const submit = async () => {
    setError(null)
    if (next.length < MIN_PASSWORD) {
      setError(`New password must be at least ${MIN_PASSWORD} characters`)
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    if (next === current) {
      setError('New password must be different from the current one')
      return
    }

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

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-6 py-4">
          <View className="gap-3">
            <Pressable
              onPress={back}
              hitSlop={8}
              className="flex-row items-center gap-1.5 self-start active:opacity-60"
            >
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">Settings</AppText>
            </Pressable>
            {/* Success replaces the form rather than sitting above it. Three filled-looking
                boxes under a success banner invite a second submit, which would fail — the
                current password is no longer current. */}
            <PageHeader
              title={done ? 'Password changed' : 'Change password'}
              subtitle={
                done
                  ? 'Your other devices have been signed out.'
                  : 'You will stay signed in here. Every other device is signed out.'
              }
            />
          </View>

          {done ? (
            <View className="gap-4">
              <View className="flex-row items-start gap-1.5">
                <Check size={14} color={brand.success} strokeWidth={2.4} style={{ marginTop: 1 }} />
                <AppText variant="body" className="flex-1">
                  You are still signed in on this device.
                </AppText>
              </View>
              <Button title="Back to settings" variant="secondary" onPress={back} />
            </View>
          ) : (
            <View className="gap-3">
              <Field
                label="Current password"
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />
              <Field
                label="New password"
                value={next}
                onChangeText={setNext}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                // newPassword lets the OS keychain offer to generate and save one, and
                // stops it filing the new value under the old password's entry.
                textContentType="newPassword"
              />
              <Field
                label="Confirm new password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
              <Muted>At least {MIN_PASSWORD} characters. You stay signed in on this device.</Muted>
              {/* Standalone rather than on a Field: most of these errors are about the
                  current password or come from the server, and hanging them off the confirm
                  box pointed the user at the wrong input. Sits directly above the buttons,
                  matching web — a form-level error belongs next to the action it blocked,
                  not wedged between a field and its own hint. */}
              {error ? (
                <View className="flex-row items-start gap-1.5">
                  <AlertTriangle size={13} color={brand.error} strokeWidth={2.4} style={{ marginTop: 1 }} />
                  <AppText variant="caption" color="error" className="flex-1">{error}</AppText>
                </View>
              ) : null}
              <View className="flex-row gap-2">
                <Button title="Update password" onPress={submit} loading={saving} className="flex-1" />
                <Button title="Cancel" variant="secondary" onPress={back} disabled={saving} className="flex-1" />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}
