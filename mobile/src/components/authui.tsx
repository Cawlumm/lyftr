import { ReactNode, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Mail, Lock, Eye, EyeOff, Server, ChevronDown, LogIn, Play } from 'lucide-react-native'
import { useServerStore } from '../lib/lyftr'
import { testServerConnection, normalizeServerUrl } from '@lyftr/shared'

const FONT = {
  label: 'PlusJakartaSans_800ExtraBold',
  body: 'PlusJakartaSans_600SemiBold',
  btn: 'PlusJakartaSans_800ExtraBold',
}

// Dark labelled input with a leading icon (+ optional password eye).
export function IconInput({
  label,
  icon,
  password,
  ...rest
}: TextInputProps & { label: string; icon: 'mail' | 'lock'; password?: boolean }) {
  const [focused, setFocused] = useState(false)
  const [hide, setHide] = useState(!!password)
  const Icon = icon === 'mail' ? Mail : Lock
  return (
    <View style={{ marginTop: 19 }}>
      <Text
        style={{
          fontFamily: FONT.label,
          fontSize: 11,
          letterSpacing: 1.4,
          color: '#94a3b8',
          marginBottom: 8,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          height: 55,
          paddingHorizontal: 16,
          borderRadius: 15,
          backgroundColor: '#111e35',
          borderWidth: 1.5,
          borderColor: focused ? '#00b8d9' : '#1c2f50',
          shadowColor: focused ? '#00b8d9' : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.25 : 0,
          shadowRadius: 8,
        }}
      >
        <Icon size={17} color={focused ? '#00b8d9' : '#94a3b8'} strokeWidth={2} />
        <TextInput
          style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, color: '#f1f5f9' }}
          placeholderTextColor="#475569"
          secureTextEntry={hide}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {password ? (
          <Pressable onPress={() => setHide((h) => !h)} hitSlop={10}>
            {hide ? <Eye size={19} color="#94a3b8" strokeWidth={2} /> : <EyeOff size={19} color="#94a3b8" strokeWidth={2} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string
  onPress?: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        marginTop: 26,
        borderRadius: 16,
        shadowColor: '#00b8d9',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 8,
      }}
    >
      <LinearGradient
        colors={['#00b8d9', '#8b5cf6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 57,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={{ fontFamily: FONT.btn, fontSize: 16.5, color: '#fff' }}>{title}</Text>
            <LogIn size={18} color="#fff" strokeWidth={2.6} />
          </>
        )}
      </LinearGradient>
    </Pressable>
  )
}

export function SecondaryButton({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 52,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: '#0d1629',
        borderWidth: 1.5,
        borderColor: '#1c2f50',
      }}
    >
      <Play size={17} color="#00b8d9" strokeWidth={2.2} fill="rgba(0,184,217,0.18)" />
      <Text style={{ fontFamily: FONT.btn, fontSize: 15, color: '#f1f5f9' }}>{title}</Text>
    </Pressable>
  )
}

export function AuthDivider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 22 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: '#1c2f50' }} />
      <Text style={{ fontFamily: FONT.label, fontSize: 11, letterSpacing: 1.8, color: '#475569' }}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: '#1c2f50' }} />
    </View>
  )
}

// Server settings row that expands to a URL field (self-hosted users). Dark themed.
export function ServerRow() {
  const serverUrl = useServerStore((s) => s.serverUrl)
  const setServerUrl = useServerStore((s) => s.setServerUrl)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(serverUrl)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [testing, setTesting] = useState(false)

  const save = async () => {
    setTesting(true)
    setMsg(null)
    const base = normalizeServerUrl(url)
    if (url.trim() && !base) {
      setOk(false)
      setMsg('Include http:// or https://')
      setTesting(false)
      return
    }
    const result = await testServerConnection(base)
    if (result.ok) {
      await setServerUrl(url)
      setOk(true)
      setMsg(`Connected to ${result.info.name} v${result.info.version}`)
    } else {
      setOk(false)
      setMsg(result.message)
    }
    setTesting(false)
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: '#0d1629',
          borderWidth: 1,
          borderColor: '#1c2f50',
          borderRadius: 13,
          paddingVertical: 12,
          paddingHorizontal: 15,
        }}
      >
        <Server size={16} color="#8b5cf6" strokeWidth={2} />
        <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 13, color: '#cbd5e1' }}>Server settings</Text>
        <Text style={{ fontFamily: FONT.body, fontSize: 12, color: '#94a3b8' }}>
          {serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'default'}
        </Text>
        <ChevronDown size={14} color="#94a3b8" strokeWidth={2.4} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <TextInput
            value={url}
            onChangeText={(t) => { setMsg(null); setUrl(t) }}
            placeholder="http://your-server:3000"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              height: 48,
              borderRadius: 13,
              paddingHorizontal: 15,
              backgroundColor: '#111e35',
              borderWidth: 1.5,
              borderColor: '#1c2f50',
              color: '#f1f5f9',
              fontFamily: FONT.body,
              fontSize: 14,
            }}
          />
          {msg ? (
            <Text style={{ fontFamily: FONT.body, fontSize: 12, color: ok ? '#4ade80' : '#f87171' }}>{msg}</Text>
          ) : null}
          <Pressable
            onPress={save}
            style={{
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0d1629',
              borderWidth: 1.5,
              borderColor: '#1c2f50',
            }}
          >
            {testing ? (
              <ActivityIndicator color="#00b8d9" />
            ) : (
              <Text style={{ fontFamily: FONT.btn, fontSize: 14, color: '#cbd5e1' }}>Test & save</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function Footer({ children }: { children: ReactNode }) {
  // Flow right under the content (28px) instead of pinning to the bottom — kills the
  // dead space between "Try demo account" and this footer.
  return (
    <View style={{ marginTop: 28, paddingBottom: 16, alignItems: 'center' }}>
      {children}
    </View>
  )
}
