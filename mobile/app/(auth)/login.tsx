import { useState } from 'react'
import { Text, View, Linking } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { IconInput, GradientButton, SecondaryButton, AuthDivider, AuthError, ServerRow, Footer } from '../../src/components/authui'
import { useAuthStore } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

// Public hosted demo (Fly) — the "Try demo account" button opens it in the browser.
const DEMO_URL = 'https://lyftr-demo.fly.dev'

// Same intent as the web's <input type=email required>: a lightweight shape check,
// not RFC validation — the server has the final say.
const EMAIL_RE = /^\S+@\S+\.\S+$/

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const { accent, colors } = useTheme()

  // Clear both the client-side and the server error when a field is edited.
  const onChange = (setter: (t: string) => void) => (t: string) => {
    clearError()
    setLocalError(null)
    setter(t)
  }

  // Validate only on submit (not while typing): the browser's `required`/`type=email`
  // equivalent, surfaced as an error after the user presses Sign in.
  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) { setLocalError('Enter a valid email address'); return }
    if (!password) { setLocalError('Enter your password'); return }
    setLocalError(null)
    try { await login(email.trim(), password) } catch {}
  }
  const demo = () => {
    Linking.openURL(DEMO_URL).catch(() => {})
  }

  const shownError = localError || error

  return (
    <AuthScaffold heading="Welcome back" subtitle="Sign in to continue training.">
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
      {shownError ? <AuthError message={shownError} /> : null}
      <GradientButton title="Sign in" onPress={submit} loading={loading} />
      <AuthDivider />
      <SecondaryButton title="Try demo account" hint="no sign-up" onPress={demo} />
      <Footer>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Text style={{ color: colors.txSecondary, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 }}>New here?</Text>
          <Link href="/register" style={{ color: accent, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14 }}>
            Create account
          </Link>
        </View>
      </Footer>
    </AuthScaffold>
  )
}
