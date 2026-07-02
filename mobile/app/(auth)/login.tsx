import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { IconInput, GradientButton, SecondaryButton, AuthDivider, ServerRow, Footer } from '../../src/components/authui'
import { useAuthStore, useServerStore } from '../../src/lib/lyftr'

// Public hosted demo (Fly). "Try demo account" points here so App Store reviewers and
// curious users get a working account with zero setup.
const DEMO_SERVER = 'https://lyftr-demo.fly.dev'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useAuthStore((s) => s.login)
  const setServerUrl = useServerStore((s) => s.setServerUrl)
  const loading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const submit = async () => {
    try { await login(email.trim(), password) } catch {}
  }
  const demo = async () => {
    try {
      await setServerUrl(DEMO_SERVER) // point at the hosted demo, then sign in
      await login('demo@lyftr.local', 'password123')
    } catch {}
  }

  return (
    <AuthScaffold heading="Welcome back" subtitle="Sign in to continue training.">
      <ServerRow />
      <IconInput
        label="Email"
        icon="mail"
        value={email}
        onChangeText={(t) => { clearError(); setEmail(t) }}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <IconInput
        label="Password"
        icon="lock"
        password
        value={password}
        onChangeText={(t) => { clearError(); setPassword(t) }}
        placeholder="••••••••"
      />
      {error ? (
        <Text style={{ marginTop: 12, color: '#f87171', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
      <GradientButton title="Sign in" onPress={submit} loading={loading} />
      <AuthDivider />
      <SecondaryButton title="Try demo account" onPress={demo} />
      <Footer>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Text style={{ color: '#94a3b8', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 }}>New here?</Text>
          <Link href="/register" style={{ color: '#38d8fb', fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14 }}>
            Create account
          </Link>
        </View>
      </Footer>
    </AuthScaffold>
  )
}
