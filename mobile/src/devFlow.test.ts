import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const MOBILE = join(__dirname, '..')
const easJson = JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8'))

// The dev launcher is a debug-build feature: expo-dev-launcher ships a src/release
// source set whose DevLauncherController is a stub that throws "DevLauncher isn't
// available in release builds", and Gradle picks source sets per variant. So the
// launcher cannot reach a release APK by accident — but `developmentClient: true` on
// the wrong profile would make that profile *build* debug, which is a different and
// entirely reachable mistake. These pin which profile is allowed to ask for it.
// A development client is a DEBUG artifact: expo-dev-launcher's release source set is a
// stub that throws "DevLauncher isn't available in release builds". So `developmentClient:
// true` on a profile that ships to anyone builds the wrong thing, quietly.
//
// This project has no such profile and no expo-dev-client dependency, on purpose: Expo Go
// runs everything the app uses, and the one thing it cannot apply — the
// expo-network-security-config plugin from #79 — is verified on the real APK instead, by
// the aapt2 check in .github/workflows/eas-build.yml. The assertion is therefore that
// NOTHING asks for a dev client; if someone adds a native module Expo Go lacks, they will
// add the dependency and the profile together, and this test is where they will be told to
// think about which profile gets it.
describe('eas build profiles', () => {
  it('ships no profile that builds a development client', () => {
    const asking = Object.entries(easJson.build)
      .filter(([, p]: [string, any]) => p.developmentClient)
      .map(([name]) => name)
    expect(asking).toEqual([])
  })
})

// Addresses that only resolve on a developer's own machine. `10.0.2.2` is the Android
// emulator's alias for the host; the loopback forms are the iOS simulator and web.
const LOCAL_HOST = /10\.0\.2\.2|127\.0\.0\.1|\blocalhost\b/
const CODE = /\.tsx?$/
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || SKIP.has(e.name)) return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return CODE.test(e.name) && !e.name.includes('.test.') ? [p] : []
  })
}

// `__DEV__` is substituted at transform time, so `if (__DEV__)` branches are dropped
// from release bundles outright. A host read from a runtime value would survive into
// the shipped bundle instead — which is the whole reason the check has to be a literal.
//
// This is deliberately file-level, not branch-level: it proves a local address can only
// appear in a file that is also reasoning about __DEV__, not that every use sits inside
// the guard. It catches the realistic mistake — someone pasting their emulator's URL in
// as a default — and is not a substitute for reading the diff.
it('confines developer-machine addresses to __DEV__ code', () => {
  const leaks = [...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app'))]
    .map((p) => [p, readFileSync(p, 'utf8')] as const)
    .filter(([, body]) => LOCAL_HOST.test(body) && !body.includes('__DEV__'))
    .map(([p]) => p.slice(MOBILE.length + 1).replace(/\\/g, '/'))
  expect(leaks).toEqual([])
})
