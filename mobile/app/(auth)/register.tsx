import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { PasswordRule } from '../../src/components/ui'
import { IconInput, GradientButton, AuthError, ServerRow, Footer } from '../../src/components/authui'
import { registrationOpen, lengthRuleLabel, matchRuleLabel, newPasswordRules } from '@lyftr/shared'
import { useAuthStore, useServerInfo } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

// Same intent as the web's <input type=email required>: a lightweight shape check,
// not RFC validation — the server has the final say.
const EMAIL_RE = /^\S+@\S+\.\S+$/

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // Only the email check lands here now — the password rules render under their own
  // fields as the user types (see below), so this holds the one error that has nowhere
  // else to go, plus whatever the server says.
  const [localError, setLocalError] = useState<string | null>(null)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const { accent, colors } = useTheme()

  const onChange = (setter: (t: string) => void) => (t: string) => {
    clearError()
    setLocalError(null)
    setter(t)
  }

  // Password rules come from @lyftr/shared, the same call web/src/pages/Register.tsx
  // makes. They used to be two hand-written checks per app, which is how the wording
  // drifted apart; now neither app can accept a password the other refuses.
  const rules = newPasswordRules({ password, confirm: passwordConfirm })

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) { setLocalError('Enter a valid email address'); return }
    // Backstop — the button is disabled until the rules pass.
    if (!rules.ready) return
    setLocalError(null)
    try { await register(email.trim(), password) } catch {}
  }

  const shownError = localError || error
  const isOpen = registrationOpen(useServerInfo())

  // A closed server explains itself instead of letting someone fill in three fields and
  // meet a 403 on submit. ServerRow stays: they may just be pointed at the wrong server.
  if (!isOpen) {
    return (
      <AuthScaffold heading="Registration closed" subtitle="This server is not accepting new accounts.">
        <ServerRow />
        <Text
          style={{
            color: colors.txSecondary,
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 14,
            lineHeight: 21,
            marginTop: 8,
          }}
        >
          The owner of this Lyftr instance has turned off new signups. If you should have an
          account here, ask them to create one for you.
        </Text>
        <Footer>
          <Link href="/login" style={{ color: accent, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14 }}>
            Back to sign in
          </Link>
        </Footer>
      </AuthScaffold>
    )
  }

  return (
    <AuthScaffold heading="Create account" subtitle="Start your training log.">
      <ServerRow />
      <IconInput
        label="Email"
        icon="mail"
        value={email}
        onChangeText={onChange(setEmail)}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <IconInput
        label="Password"
        icon="lock"
        password
        value={password}
        onChangeText={onChange(setPassword)}
        placeholder="••••••••"
      />
      <View className="gap-1.5 mt-2">
        <PasswordRule state={rules.length}>{lengthRuleLabel(password)}</PasswordRule>
      </View>
      <IconInput
        label="Confirm password"
        icon="lock"
        password
        value={passwordConfirm}
        onChangeText={onChange(setPasswordConfirm)}
        placeholder="••••••••"
      />
      <View className="gap-1.5 mt-2">
        <PasswordRule state={rules.match}>{matchRuleLabel(rules.match)}</PasswordRule>
      </View>
      {shownError ? <AuthError message={shownError} /> : null}
      <GradientButton title="Create account" onPress={submit} loading={loading} disabled={!rules.ready} />
      <Footer>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Text style={{ color: colors.txSecondary, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 }}>Have an account?</Text>
          <Link href="/login" style={{ color: accent, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14 }}>
            Sign in
          </Link>
        </View>
      </Footer>
    </AuthScaffold>
  )
}
