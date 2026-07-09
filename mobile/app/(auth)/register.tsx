import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { IconInput, GradientButton, AuthError, ServerRow, Footer } from '../../src/components/authui'
import { useAuthStore } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

// Same intent as the web's <input type=email required>: a lightweight shape check,
// not RFC validation — the server has the final say.
const EMAIL_RE = /^\S+@\S+\.\S+$/

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // Client-side validation errors (match / length), shown on submit like the web form.
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

  // Validate only on submit (not while typing) — same checks, same order, same copy
  // as web/src/pages/Register.tsx, surfaced after the user presses Create account.
  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) { setLocalError('Enter a valid email address'); return }
    if (password !== passwordConfirm) { setLocalError('Passwords do not match'); return }
    if (password.length < 8) { setLocalError('Password must be at least 8 characters'); return }
    setLocalError(null)
    try { await register(email.trim(), password) } catch {}
  }

  const shownError = localError || error

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
        placeholder="At least 8 characters"
      />
      <IconInput
        label="Confirm password"
        icon="lock"
        password
        value={passwordConfirm}
        onChangeText={onChange(setPasswordConfirm)}
        placeholder="••••••••"
      />
      {shownError ? <AuthError message={shownError} /> : null}
      <GradientButton title="Create account" onPress={submit} loading={loading} />
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
