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

```bash
npm install                                    # repo root, npm workspaces
cd mobile
npx expo install --fix                         # align native modules to the SDK
npm start                                      # Metro; press `a` for a booted emulator
```

Open the project in **Expo Go** on the device. Editing JS reloads in seconds — no build,
no EAS, no cloud quota. This is the day-to-day loop.

Two things that will waste your afternoon if you don't know them:

**`npx expo start` may crash before Metro binds.** There is a bug in `@expo/cli`'s startup
dependency check — it reads a `fetch` response body twice:

```
TypeError: Body is unusable: Body has already been read
  at getNativeModuleVersionsAsync (@expo/cli/src/api/getNativeModuleVersions.ts:47)
```

Skip the check: `EXPO_NO_DEPENDENCY_VALIDATION=1 npx expo start`. Nothing is wrong with the
project. Metro then serves normally — confirmed by curling the manifest, which comes back
`200` with `"runtimeVersion":"exposdk:54.0.0"`.

**Expo Go logs a warning about updates, and it is harmless:**

```
The expo-updates system is disabled due to an invalid configuration.
```

That is `"level":"warn"`, emitted by Expo Go's *own* bundled `expo-updates` because a local
dev project has no update URL. This repo does not depend on `expo-updates` at all. Do not
read it as the cause of an unrelated failure — it has been mistaken for one before.

If the device cannot reach Metro (`java.io.IOException: Failed to download remote update`),
that is the network between them, not the project — a host firewall on the Metro port is the
usual cause. `npx expo start --tunnel` routes via ngrok and sidesteps it.

**If the device cannot reach Metro**, the symptom is a splash screen that never advances
rather than an error. `npm run android` handles this for you - Expo CLI runs `adb reverse`
when it launches the app - so this only bites when you attach to an app that is already
running. The fallback is one command, which is what Expo's own device guide prescribes:

```bash
adb reverse tcp:8081 tcp:8081     # Metro
adb reverse tcp:3000 tcp:3000     # the backend, if 10.0.2.2 is firewalled too
```

**`npm run doctor`** runs `expo-doctor`: installed native modules against the SDK, and app
config that has drifted from what the build expects. Worth running after any dependency
change and before blaming the app for a build failure.

### Metro and the monorepo — deliberately not configured

`mobile/metro.config.js` sets no `watchFolders` and no `resolver.nodeModulesPaths`. Since
SDK 52 `expo/metro-config` detects the monorepo and sets both, and [the docs say to delete
the manual versions](https://docs.expo.dev/guides/monorepos/) rather than keep them in
step. Ours were the pre-52 recipe and they were actively harmful: they pointed
`watchFolders` at the workspace ROOT, so `metro-file-map` crawled `.git`, `backend/data`
and every session worktree under `.claude` — and died with `Failed to start watch mode`,
followed by a NativeWind `TypeError` reading a file map that was never built.

What Expo picks on its own is narrower and correct:

```
watchFolders: [ node_modules, packages/shared, mobile, web ]
```

So `@lyftr/shared` still transpiles from source (verified: a dev bundle contains
`packages/shared/src/utils/number.ts`), with nothing to keep in step by hand. If you ever
need to re-add config here, check whether Expo already does it first.

### Why there is no development build

Expo Go bundles the Expo SDK, and everything this app uses is in it — every device test in
this repo's history ran that way. The one thing Expo Go cannot apply is a **config plugin**:
`expo-network-security-config` (#79) is native XML, so the user-CA/cleartext policy is
simply absent there.

That gap is covered on the real artifact rather than by hand. The release workflow runs
`aapt2 dump xmltree` over the built APK and fails if `networkSecurityConfig` is missing, so
the plugin cannot stop applying without the release failing.

What a development client would add is JS iteration against native code nobody here has
added yet — so there is no `expo-dev-client` dependency and no `development` profile. Add
both together the day you add a native module Expo Go lacks; `src/devFlow.test.ts` fails
until you decide which profile gets it, and note that `expo start` then stops meaning Expo
Go ([launch target](https://docs.expo.dev/more/expo-cli/#launch-target)).

## Point at your backend
The **Server URL** field — on the sign-in screen and in the Settings tab — sets the
backend origin, validated via `GET /api/v1/info`. Nothing is baked in: a fresh install
talks to nothing until you set one. An explicit `http://` or `https://` is required;
the scheme is never guessed.

You type it once and it persists; `src/devFlow.test.ts` fails if a developer-machine address is hardcoded in app source instead of being entered here.

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
