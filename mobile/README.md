# Lyftr Mobile (React Native + Expo)

Universal (iOS + iPad + Android) app for Lyftr. Shares its logic — types, API client,
Zustand stores — with the web app via [`@lyftr/shared`](../packages/shared). UI is native
(SwiftUI/Kotlin-backed RN primitives), styled with NativeWind.

## Stack
- **Expo (SDK 52)** + **expo-router** (file-based routes in `app/`)
- **NativeWind** (Tailwind for RN) — tokens ported from the web `tailwind.config.ts`
- **@lyftr/shared** — the platform-agnostic core (storage-injected)
- **expo-secure-store** (tokens → Keychain) + **AsyncStorage** (prefs)
- **react-native-svg** (charts), **lucide-react-native** (icons)
- **expo-camera** (barcode, later), **expo-haptics** (rest timer, later)

## Run it (development)
From the **repo root** (npm workspaces):
```bash
npm install                     # installs shared + mobile
npx expo install --fix          # (in mobile/) align native module versions to the SDK
cd mobile && npx expo start      # Metro dev server
```
Then on your **phone**: open **Expo Go**, connect over Wi‑Fi / **Tailscale** (or
`npx expo start --tunnel`), and scan the QR. Once native modules (SecureStore, camera,
haptics) are in play, build a **dev client** instead of Expo Go:
```bash
eas build --profile development --platform ios   # cloud build, no Mac needed
```

On a **laptop**: `npx expo start --web` (quick UI checks), or press `i` (iOS Simulator,
Mac only) / `a` (Android emulator).

## Point at your backend
The **Server URL** field in the Settings tab configures the backend origin (validated via
`GET /api/v1/info`). Leave blank for the default. For the VM dev backend use the LAN IP or
the Tailscale URL, e.g. `https://claude-code.tail2b1098.ts.net:3000`. Demo login:
`demo@lyftr.local` / `password123`.

## MVP scope (this PR)
Auth (login/register) → Dashboard summary → Weight (log / list / delete + trend chart).
Later: Food + barcode, Workouts + active session, Programs, gym mode, and the first Swift
native module (lock-screen rest-timer Live Activity).

## Cloud builds
```bash
eas build -p ios       # / -p android  — installable binaries, no local Mac required
```
