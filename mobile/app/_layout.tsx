import '../src/lib/polyfills'
import '../global.css'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Slot, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { colorScheme } from 'nativewind'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit'
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { useAuthStore, useServerStore, useThemeStore } from '../src/lib/lyftr'
import { useTheme } from '../src/theme/useTheme'

// Root layout: hydrate persisted state once, then gate routes on auth. Unauthed users
// are pushed into the (auth) group; authed users out of it.
export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const hydrateServer = useServerStore((s) => s.hydrate)
  const hydrateTheme = useThemeStore((s) => s.hydrate)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const themeHydrated = useThemeStore((s) => s.isHydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated)
  const { mode, isDark, colors } = useTheme()
  const segments = useSegments()
  const router = useRouter()
  const [fontsLoaded] = useFonts({
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  })
  const ready = isHydrated && themeHydrated && fontsLoaded

  useEffect(() => {
    hydrateAuth()
    hydrateServer()
    hydrateTheme()
  }, [hydrateAuth, hydrateServer, hydrateTheme])

  // Drive NativeWind's className theming from the same store the inline-styled
  // screens read, so `dark:`/CSS-var tokens flip together with useTheme().
  useEffect(() => {
    colorScheme.set(mode)
  }, [mode])

  useEffect(() => {
    if (!isHydrated) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!isAuthed && !inAuthGroup) router.replace('/login')
    else if (isAuthed && inAuthGroup) router.replace('/')
  }, [isHydrated, isAuthed, segments, router])

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {ready ? (
        <Slot />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.base }}>
          <ActivityIndicator color="#00b8d9" />
        </View>
      )}
    </SafeAreaProvider>
  )
}
