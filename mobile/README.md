# Lyftr Mobile (React Native + Expo)

Universal (iOS + iPad + Android) app for Lyftr. Shares its logic — types, API client,
Zustand stores — with the web app via [`@lyftr/shared`](../packages/shared). UI is native
(SwiftUI/Kotlin-backed RN primitives), styled with NativeWind.

## Stack
- **Expo (SDK 54)** + **expo-router** (file-based routes in `app/`)
- **NativeWind** (Tailwind for RN) — tokens ported from the web `tailwind.config.ts`
- **@lyftr/shared** — the platform-agnostic core (storage-injected)
- **expo-secure-store** (tokens → Keychain) + **AsyncStorage** (prefs)
- **react-native-svg** (charts), **lucide-react-native** (icons)
- **expo-camera** (barcode, later), **expo-haptics** (rest timer, later)

## Run it (development)

**Expo Go cannot run this app.** `app.json` declares config plugins (secure-store,
camera, splash, fonts, localization, the Android network-security config), and Expo Go
ships a fixed set of native modules that doesn't include them. Trying anyway fails with
`expo-updates system is disabled due to an invalid configuration`. You need a
**development build** — your own build of the app that speaks to Metro.

It is a **one-time** cost. After it's installed, JS changes reload over Metro in seconds
and you never rebuild unless a *native* dependency changes.

```bash
npm install                                    # repo root, npm workspaces
cd mobile
npx expo install --fix                         # align native modules to the SDK
npm run build:dev                              # one-time cloud build (EAS), ~15-25 min
```

`build:dev` uses an EAS **cloud** build, which draws on the monthly quota. The free way is
to build it on a GitHub runner instead — Actions → *EAS build* → *Run workflow* → tick
**dev_client**. That runs `eas build --profile development --local`, which stays on the
runner and costs no quota, and uploads the APK as a workflow artifact named after its
native fingerprint.

Either way it is one build. You do not rebuild it to pick up a JS change — that is what
Metro is for. You rebuild when the **native** surface moves: a new native dependency, a
config plugin, an SDK bump. The fingerprint tells you when that has happened:

```bash
npx @expo/fingerprint fingerprint:generate --platform android
```

Same hash as the dev client you are running means the one on your device is still current,
however much JS has changed under it.

Install the resulting APK, then for day-to-day work:

```bash
npm start                                      # = expo start --dev-client
```

Open the app; it connects to Metro. Press `a` to launch it on a booted Android emulator.

**Never build locally.** No `expo run:android`, no `expo prebuild` + Gradle, no
`eas build --local`. A first local build is 10–25 minutes of toolchain download before
it compiles anything, and `prebuild` writes an untracked `android/` and rewrites the
`android`/`ios` scripts in `package.json`. Build through EAS or a CI runner.

`npm run web` still works for quick UI checks that don't touch native modules.

### Build profiles (`eas.json`)

| Profile | What it is | Dev launcher | Artifact |
|---|---|---|---|
| `development` | what you develop against — loads JS from Metro | yes | debug APK |
| `preview` | a self-contained build to hand someone; JS is baked in | no | release APK |
| `production` | store submission | no | AAB |

Only `development` sets `developmentClient`. That matters: the dev launcher and dev menu
are a *debug-build* feature — `expo-dev-launcher` ships a `src/release` source set whose
controller throws `DevLauncher isn't available in release builds`, and Gradle picks
source sets per variant — so they cannot appear in a `preview` or `production` build.
`src/devFlow.test.ts` pins which profile is allowed to ask for it.

A `preview` build ignores Metro entirely. If you change JS and the app doesn't update,
that's why: you're on the wrong profile.

## Point at your backend
The **Server URL** field — on the sign-in screen and in the Settings tab — sets the
backend origin, validated via `GET /api/v1/info`. There is no default: a fresh install
talks to nothing until you set one. An explicit `http://` or `https://` is required;
the scheme is never guessed.

In a **development build only**, that field shows one-tap buttons for the local backend
— `http://10.0.2.2:3000` on Android (the emulator's alias for the host machine; its own
`localhost` is the emulator itself), `http://localhost:3000` on an iOS simulator. They sit
behind `__DEV__`, which Metro substitutes at transform time, so neither the buttons nor
the addresses exist in a release bundle. `src/devFlow.test.ts` enforces that.

Over a LAN or a VPN, use that machine's address — `npx expo start --tunnel` if the
network blocks the direct route.

Demo login `demo@lyftr.local` / `password123` exists on a dev backend and on the hosted
demo. `DEMO_MODE` defaults to on whenever `ENV` is unset or not `production`, so a
self-hosted instance that sets neither variable **will** have that account with that
published password. Set `ENV=production` (or `DEMO_MODE=false`) on anything real.

## Native networking config
`network_security_config.xml` is an Android
[network security config](https://developer.android.com/privacy-and-security/security-config)
permitting cleartext HTTP and trusting the user-installed CA store (issue #79). The file's
own header explains why and what it deliberately does *not* do. It's copied into the build
by [`expo-network-security-config`](https://github.com/pchalupa/expo-network-security-config),
wired up in `app.json` — a maintained plugin rather than a hand-rolled one, so tracking
Expo SDK changes to the underlying dangerous mod isn't our job.

What matters when working on it: it's applied at prebuild, so changes only take effect in a
**new build** — EAS Update cannot deliver them. To inspect the generated output:
```bash
npx expo prebuild -p android --clean --no-install
cat android/app/src/main/res/xml/network_security_config.xml
rm -rf android           # generated, gitignored — don't commit it
```
Note `expo prebuild` rewrites the `android`/`ios` npm scripts to `expo run:*`; revert that.

## MVP scope (this PR)
Auth (login/register) → Dashboard summary → Weight (log / list / delete + trend chart).
Later: Food + barcode, Workouts + active session, Programs, gym mode, and the first Swift
native module (lock-screen rest-timer Live Activity).

## Cloud builds
```bash
eas build -p ios       # / -p android  — installable binaries, no local Mac required
```
