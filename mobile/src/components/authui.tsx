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
import { useTheme } from '../theme/useTheme'
import { testServerConnection, normalizeServerUrl } from '@lyftr/shared'

const FONT = {
  label: 'PlusJakartaSans_800ExtraBold',
  body: 'PlusJakartaSans_600SemiBold',
  btn: 'PlusJakartaSans_800ExtraBold',
}
const LABEL_COLOR = '#94a3b8' // legible on both light + dark surfaces

// Dark/light labelled input with a leading icon (+ optional password eye).
export function IconInput({
  label,
  icon,
  password,
  ...rest
}: TextInputProps & { label: string; icon: 'mail' | 'lock'; password?: boolean }) {
  const { colors, brand } = useTheme()
  const [focused, setFocused] = useState(false)
  const [hide, setHide] = useState(!!password)
  const Icon = icon === 'mail' ? Mail : Lock
  return (
    <View style={{ marginTop: 19 }}>
      <Text style={{ fontFamily: FONT.label, fontSize: 11, letterSpacing: 1.4, color: LABEL_COLOR, marginBottom: 8 }}>
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
          backgroundColor: colors.overlay,
          borderWidth: 1.5,
          borderColor: focused ? brand.cyan : colors.border,
          shadowColor: focused ? brand.cyan : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.25 : 0,
          shadowRadius: 8,
        }}
      >
        <Icon size={17} color={focused ? brand.cyan : LABEL_COLOR} strokeWidth={2} />
        <TextInput
          style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, color: colors.txPrimary }}
          placeholderTextColor={colors.txMuted}
          secureTextEntry={hide}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {password ? (
          <Pressable onPress={() => setHide((h) => !h)} hitSlop={10}>
            {hide ? <Eye size={19} color={LABEL_COLOR} strokeWidth={2} /> : <EyeOff size={19} color={LABEL_COLOR} strokeWidth={2} />}
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
  const { brand } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        marginTop: 26,
        borderRadius: 16,
        shadowColor: brand.cyan,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 8,
      }}
    >
      <LinearGradient
        colors={[brand.cyan, brand.violet]}
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

export function SecondaryButton({ title, hint, onPress }: { title: string; hint?: string; onPress?: () => void }) {
  const { colors, brand } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 55,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: colors.raised,
        borderWidth: 1.5,
        borderColor: colors.border,
      }}
    >
      <Play size={17} color={brand.cyan} strokeWidth={2.2} fill="rgba(0,184,217,0.18)" />
      <Text style={{ fontFamily: FONT.btn, fontSize: 15, color: colors.txPrimary }}>{title}</Text>
      {hint ? <Text style={{ fontFamily: FONT.body, fontSize: 12.5, color: colors.txMuted }}>{hint}</Text> : null}
    </Pressable>
  )
}

export function AuthDivider() {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 22 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text style={{ fontFamily: FONT.label, fontSize: 11, letterSpacing: 1.8, color: colors.txMuted }}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  )
}

// Server settings row that expands to a URL field (self-hosted users).
export function ServerRow() {
  const { colors, brand, accent } = useTheme()
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
          backgroundColor: colors.raised,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 13,
          paddingVertical: 12,
          paddingHorizontal: 15,
        }}
      >
        <Server size={16} color={brand.violet} strokeWidth={2} />
        <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 13, color: colors.txPrimary }}>Server settings</Text>
        <Text style={{ fontFamily: FONT.body, fontSize: 12, color: colors.txSecondary }}>
          {serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'default'}
        </Text>
        <ChevronDown size={14} color={colors.txMuted} strokeWidth={2.4} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <TextInput
            value={url}
            onChangeText={(t) => { setMsg(null); setUrl(t) }}
            placeholder="http://your-server:3000"
            placeholderTextColor={colors.txMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              height: 48,
              borderRadius: 13,
              paddingHorizontal: 15,
              backgroundColor: colors.overlay,
              borderWidth: 1.5,
              borderColor: colors.border,
              color: colors.txPrimary,
              fontFamily: FONT.body,
              fontSize: 14,
            }}
          />
          {msg ? (
            <Text style={{ fontFamily: FONT.body, fontSize: 12, color: ok ? brand.success : brand.error }}>{msg}</Text>
          ) : null}
          <Pressable
            onPress={save}
            style={{
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.raised,
              borderWidth: 1.5,
              borderColor: colors.border,
            }}
          >
            {testing ? (
              <ActivityIndicator color={accent} />
            ) : (
              <Text style={{ fontFamily: FONT.btn, fontSize: 14, color: colors.txSecondary }}>Test & save</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function Footer({ children }: { children: ReactNode }) {
  return (
    <View style={{ marginTop: 28, paddingBottom: 16, alignItems: 'center' }}>
      {children}
    </View>
  )
}
