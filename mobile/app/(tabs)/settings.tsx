import { useEffect, useState } from 'react'
import { ScrollView, View, Text, Pressable } from 'react-native'
import { Sun, Moon } from 'lucide-react-native'
import { Screen, H1, Card, Field, Button, Muted } from '../../src/components/ui'
import { client, useAuthStore, useServerStore, useSettingsStore } from '../../src/lib/lyftr'
import { useTheme } from '../../src/theme/useTheme'
import { testServerConnection, normalizeServerUrl } from '@lyftr/shared'

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const serverUrl = useServerStore((s) => s.serverUrl)
  const setServerUrl = useServerStore((s) => s.setServerUrl)
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const updateSettings = useSettingsStore((s) => s.update)

  const [urlInput, setUrlInput] = useState(serverUrl)
  const [serverMsg, setServerMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])
  useEffect(() => {
    setUrlInput(serverUrl)
  }, [serverUrl])

  const saveServer = async () => {
    setTesting(true)
    setServerMsg(null)
    const base = normalizeServerUrl(urlInput)
    if (urlInput.trim() && !base) {
      setServerMsg('Enter a full URL including http:// or https://')
      setTesting(false)
      return
    }
    const result = await testServerConnection(base)
    if (result.ok) {
      await setServerUrl(urlInput)
      setServerMsg(`Connected to ${result.info.name} v${result.info.version}`)
    } else {
      setServerMsg(result.message)
    }
    setTesting(false)
  }

  const unit = settings.weight_unit
  const toggleUnit = () => updateSettings({ weight_unit: unit === 'lbs' ? 'kg' : 'lbs' })

  const { mode, setMode } = useTheme()

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-6 py-4">
          <H1>Settings</H1>

          <Card>
            <Muted className="text-xs uppercase">Account</Muted>
            <Text className="text-tx-primary text-base mt-1">{user?.email}</Text>
          </Card>

          <Card>
            <Muted className="text-xs uppercase mb-2">Weight unit</Muted>
            <View className="flex-row gap-2">
              <UnitPill label="lbs" active={unit === 'lbs'} onPress={() => unit !== 'lbs' && toggleUnit()} />
              <UnitPill label="kg" active={unit === 'kg'} onPress={() => unit !== 'kg' && toggleUnit()} />
            </View>
          </Card>

          <Card>
            <Muted className="text-xs uppercase mb-2">Appearance</Muted>
            <View className="flex-row gap-2">
              <ThemePill label="Light" icon="sun" active={mode === 'light'} onPress={() => setMode('light')} />
              <ThemePill label="Dark" icon="moon" active={mode === 'dark'} onPress={() => setMode('dark')} />
            </View>
          </Card>

          <Card>
            <Field
              label="Server URL"
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://your-server.example.com"
            />
            <Muted className="text-xs mt-1">Leave blank to use the default backend.</Muted>
            {serverMsg ? <Text className="text-xs mt-2 text-brand-400">{serverMsg}</Text> : null}
            <Button title="Test & save" variant="secondary" onPress={saveServer} loading={testing} className="mt-3" />
          </Card>

          <Button title="Log out" variant="danger" onPress={() => logout()} />
        </View>
      </ScrollView>
    </Screen>
  )
}

function UnitPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-5 h-11 rounded-lg items-center justify-center ${active ? 'bg-brand-500' : 'bg-surface-muted border border-surface-border'}`}
    >
      <Text className={`font-semibold ${active ? 'text-white' : 'text-tx-secondary'}`}>{label}</Text>
    </Pressable>
  )
}

function ThemePill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string
  icon: 'sun' | 'moon'
  active: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  const Icon = icon === 'sun' ? Sun : Moon
  const tint = active ? '#ffffff' : colors.txSecondary
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row gap-2 h-11 rounded-lg items-center justify-center ${active ? 'bg-brand-500' : 'bg-surface-muted border border-surface-border'}`}
    >
      <Icon color={tint} size={16} strokeWidth={2.2} />
      <Text className={`font-semibold ${active ? 'text-white' : 'text-tx-secondary'}`}>{label}</Text>
    </Pressable>
  )
}
