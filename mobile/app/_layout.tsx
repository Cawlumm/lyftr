import '../src/lib/polyfills'
import '../global.css'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
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
import { useAuthStore, useServerStore, useSettingsStore, useThemeStore, useWorkoutSession } from '../src/lib/lyftr'
import { useTheme } from '../src/theme/useTheme'
import { Loading } from '../src/components/ui'
import { WorkoutSessionLayer } from '../src/components/workouts/WorkoutSessionLayer'

// Hold the native splash (the static barbell icon) up until React has painted its
// first frame, so cold start hands off splash → animated barbell loader with no
// white/blank flash in between. Hidden on mount below.
SplashScreen.preventAutoHideAsync().catch(() => {})

// Route access is declared, not navigated. Stack.Protected takes a boolean guard and,
// when a screen becomes protected while it is active, expo-router redirects to the first
// available screen and drops the protected entries from history. Nothing here calls
// router.replace, so there is no imperative navigation to argue with the auth store -
// which is precisely what #145 was: the API client pushed /login on a failed refresh
// while the store still said the user was signed in, this layout pushed them back, and
// the two bounced until React threw "Maximum update depth exceeded", leaving an app that
// still drew but answered no presses until it was force-quit.
//
// This is the pattern both frameworks now prescribe. React Navigation's auth-flow guide:
// "you don't manually navigate ... React Navigation will automatically navigate to the
// correct screen when isSignedIn changes". Expo Router shipped Stack.Protected in v5 to
// "avoid imperative redirects"; we are on v6 and were still using the older pattern.
//
// The two guards are complementary on purpose: exactly one group is reachable at any
// moment, so a signed-out user cannot sit on a tab and a signed-in one cannot sit on
// login. Making the loop unrepresentable beats detecting it.
function RootStack({ isAuthed }: { isAuthed: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthed}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthed}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  )
}

// Root layout: hydrate persisted state once; the stack below decides what is reachable.
export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const hydrateServer = useServerStore((s) => s.hydrate)
  const hydrateTheme = useThemeStore((s) => s.hydrate)
  const hydrateWorkout = useWorkoutSession((s) => s.hydrate)
  const hydratePrefs = useSettingsStore((s) => s.hydratePrefs)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const themeHydrated = useThemeStore((s) => s.isHydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated)
  const { mode, isDark } = useTheme()
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
    hydrateWorkout()
    // Device-only prefs (workout_layout, rest_enabled, rest_seconds_default). Without
    // this they stay at the store defaults until the settings fetch returns, so a
    // gym-mode user can land on the workout screen in the list layout — the same gap
    // web closes in its own hydrate step.
    hydratePrefs()
  }, [hydrateAuth, hydrateServer, hydrateTheme, hydrateWorkout, hydratePrefs])

  // React has mounted → the barbell loader (or the app, if already ready) is on screen.
  // Drop the native splash now so it flows straight into the animated loader.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  // Drive NativeWind's className theming from the same store the inline-styled
  // screens read, so `dark:`/CSS-var tokens flip together with useTheme().
  useEffect(() => {
    colorScheme.set(mode)
  }, [mode])


  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {ready ? <RootStack isAuthed={isAuthed} /> : <Loading />}
      {/* Always-mounted session UI (gym overlay + minimized pill), above the tabs so it
          covers the tab bar — mirrors web's Layout. Self-hides when authed/no session. */}
      {ready && isAuthed ? <WorkoutSessionLayer /> : null}
    </SafeAreaProvider>
  )
}
