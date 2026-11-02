import { useRef, useState } from 'react'
import { Linking, Platform } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { SecondaryButton } from '../authui'

// Public hosted demo (Fly). Native has no server to sign in to here, so it opens this.
export const DEMO_URL = 'https://lyftr-demo.fly.dev'

export const DEMO_EMAIL = 'demo@lyftr.local'
export const DEMO_PASSWORD = 'password123'

type Props = {
  // demoMode(serverInfo): on web the button follows the server's own flag, like the Vite app.
  demoEnabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  onFailed: (err: unknown) => void
}

export function DemoButton({ demoEnabled, signIn, onFailed }: Props) {
  const { t } = useTranslation()
  const isWeb = Platform.OS === 'web'
  const [busy, setBusy] = useState(false)
  // A ref as well as state: two presses in one frame both read the stale state.
  const inFlight = useRef(false)
  if (isWeb && !demoEnabled) return null

  const press = () => {
    if (!isWeb) { Linking.openURL(DEMO_URL).catch(() => {}); return }
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    signIn(DEMO_EMAIL, DEMO_PASSWORD).catch(onFailed).finally(() => { inFlight.current = false; setBusy(false) })
  }
  return <SecondaryButton title={t('auth.login.demo')} hint={t('auth.login.demoHint')} onPress={press} disabled={busy} />
}
