import { useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthScaffold } from '../../src/components/AuthScaffold'
import { IconInput, GradientButton, AuthDivider, AuthError, ServerRow, Footer } from '../../src/components/authui'
import { DemoButton } from '../../src/components/auth/DemoButton'
import { demoMode, registrationOpen, uiMessage, useTranslation, type UiMessage } from '@lyftr/shared'
import { useAuthStore, useServerInfo } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'

// Same intent as the web's <input type=email required>: a lightweight shape check,
// not RFC validation — the server has the final say.
const EMAIL_RE = /^\S+@\S+\.\S+$/

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<UiMessage | null>(null)
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const { accent, colors } = useTheme()
  const serverInfo = useServerInfo()
  const isOpen = registrationOpen(serverInfo)

  // Clear both the client-side and the server error when a field is edited.
  const onChange = (setter: (t: string) => void) => (t: string) => {
    clearError()
    setLocalError(null)
    setter(t)
  }

  // Validate only on submit (not while typing): the browser's `required`/`type=email`
  // equivalent, surfaced as an error after the user presses Sign in.
  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) { setLocalError({ key: 'auth.validation.emailInvalid' }); return }
    if (!password) { setLocalError({ key: 'auth.validation.passwordRequired' }); return }
    setLocalError(null)
    try { await login(email.trim(), password) } catch {}
  }
  const demoFailed = (err: unknown) => setLocalError({ key: 'auth.login.demoFailed', cause: err })

  const shownError = localError || error

  return (
    <AuthScaffold heading={t('auth.login.heading')} subtitle={t('auth.login.subtitle')}>
      <ServerRow />
      <IconInput
        id="email"
        label={t('auth.field.email')}
        icon="mail"
        value={email}
        onChangeText={onChange(setEmail)}
        keyboardType="email-address"
        // Browser autofill tokens, as the Vite page had; native keeps its defaults.
        autoComplete={Platform.OS === 'web' ? 'email' : undefined}
        placeholder={t('auth.field.emailPlaceholder')}
      />
      <IconInput
        id="password"
        label={t('auth.field.password')}
        icon="lock"
        password
        value={password}
        onChangeText={onChange(setPassword)}
        autoComplete={Platform.OS === 'web' ? 'current-password' : undefined}
        placeholder="••••••••"
      />
      {shownError ? <AuthError message={uiMessage(shownError)} /> : null}
      <GradientButton title={t('auth.login.submit')} onPress={submit} loading={loading} />
      <AuthDivider />
      <DemoButton demoEnabled={demoMode(serverInfo)} signIn={login} onFailed={demoFailed} />
      {/* A closed server says so instead of offering a link that 403s on submit — but it
          does still say so, rather than leaving someone who came to sign up hunting for a
          button that is not there (mastodon/mastodon#21556). */}
      <Footer>
        {isOpen ? (
          <View style={{ flexDirection: 'row', gap: 5 }}>
            <Text style={{ color: colors.txSecondary, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 }}>{t('auth.login.newHere')}</Text>
            <Link href="/register" style={{ color: accent, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14 }}>
              {t('auth.login.createAccountLink')}
            </Link>
          </View>
        ) : (
          <Text style={{ color: colors.txSecondary, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 }}>
            {t('auth.closed.notice')}
          </Text>
        )}
      </Footer>
    </AuthScaffold>
  )
}
