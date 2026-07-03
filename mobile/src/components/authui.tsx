import { ReactNode, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated'
import { AlertCircle, Mail, Lock, Eye, EyeOff, Server, ChevronDown, LogIn, Play } from 'lucide-react-native'
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
  const [hide, setHide] = useState(!!password)
  // Focus styling via Reanimated (UI thread) instead of React state. On the New
  // Architecture (Fabric), a React re-render fired from a TextInput's own onFocus
  // immediately blurs the input — the keyboard flashes up then dismisses. Driving the
  // border/glow off a shared value means focusing causes NO re-render, so it sticks.
  const focus = useSharedValue(0)
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.border, brand.cyan]),
    shadowOpacity: focus.value * 0.25,
  }))
  const Icon = icon === 'mail' ? Mail : Lock
  return (
    <View style={{ marginTop: 19 }}>
      <Text style={{ fontFamily: FONT.label, fontSize: 11, letterSpacing: 1.4, color: LABEL_COLOR, marginBottom: 8 }}>
        {label.toUpperCase()}
      </Text>
      <Reanimated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            height: 55,
            paddingHorizontal: 16,
            borderRadius: 15,
            backgroundColor: colors.overlay,
            borderWidth: 1.5,
            shadowColor: brand.cyan,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 8,
          },
          boxStyle,
        ]}
      >
        <Icon size={17} color={LABEL_COLOR} strokeWidth={2} />
        <TextInput
          style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, color: colors.txPrimary }}
          placeholderTextColor={colors.txMuted}
          secureTextEntry={hide}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => { focus.value = withTiming(1, { duration: 150 }) }}
          onBlur={() => { focus.value = withTiming(0, { duration: 150 }) }}
          {...rest}
        />
        {password ? (
          <Pressable onPress={() => setHide((h) => !h)} hitSlop={10}>
            {hide ? <Eye size={19} color={LABEL_COLOR} strokeWidth={2} /> : <EyeOff size={19} color={LABEL_COLOR} strokeWidth={2} />}
          </Pressable>
        ) : null}
      </Reanimated.View>
    </View>
  )
}

// Boxed error alert — mirror of the web's `.alert-error` (soft error-tinted bg, error
// border, AlertCircle icon). Text is errorSoft on dark but the stronger error red on
// light, where errorSoft doesn't have enough contrast. Fades/slides in on appearance.
export function AuthError({ message }: { message: string }) {
  const { isDark, brand } = useTheme()
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    anim.setValue(0)
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [message, anim])
  const tint = isDark ? brand.errorSoft : brand.error
  return (
    <Animated.View
      style={{
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.2)',
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
      }}
    >
      <AlertCircle size={16} color={tint} strokeWidth={2.2} style={{ marginTop: 1.5 }} />
      <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 13, lineHeight: 19, color: tint }}>
        {message}
      </Text>
    </Animated.View>
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
