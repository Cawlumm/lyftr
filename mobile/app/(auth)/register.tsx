import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { IconInput, GradientButton, ServerRow, Footer } from '../../src/components/authui'
import { useAuthStore } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const { accent, colors } = useTheme()

  const localError =
    password.length > 0 && password.length < 8 ? 'Password must be at least 8 characters' : null

  const submit = async () => {
    if (localError) return
    try { await register(email.trim(), password) } catch {}
  }

  return (
    <AuthScaffold heading="Create account" subtitle="Start your training log.">
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
        placeholder="At least 8 characters"
      />
      {(localError || error) ? (
        <Text style={{ marginTop: 12, color: '#f87171', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 }}>
          {localError || error}
        </Text>
      ) : null}
      <GradientButton title="Create account" onPress={submit} loading={loading} disabled={!!localError} />
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
