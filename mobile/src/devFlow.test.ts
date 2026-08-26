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
// One config assertion earns its place. The rest of what used to be here — production is
// distribution:store, buildArchs equals this literal, no channel keys — read a value out
// of eas.json/app.json and asserted it equalled the value written in the same commit. That
// is a change detector with no independent oracle: it cannot find a defect, only an edit,
// and it made the correct fix (moving buildArchs behind EAS_BUILD_PROFILE) fail CI.
//
// This one survives because it has an oracle outside the file it reads: a development
// client is a debug artifact, so asking for one on a profile that ships to users would
// build the wrong thing, and nothing else in the repo would say so.
describe('eas build profiles', () => {
  it('asks for a development client on the development profile only', () => {
    const asking = Object.entries(easJson.build)
      .filter(([, p]: [string, any]) => p.developmentClient)
      .map(([name]) => name)
    expect(asking).toEqual(['development'])
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

// The __DEV__ scan above only reads app source, and this PR moved the dev backend address
// out of source and into configuration — so on its own it now guards an empty room.
// Adversarial review found the two ways a developer's LAN address can still reach a
// release bundle, both of which bypass a source scan entirely:
//
//   1. a committed mobile/.env.production. @expo/env loads .env.<mode> for the build's
//      mode, and EXPO_PUBLIC_ values are inlined. (.gitignore now covers .env*, so this
//      is belt and braces — but the ignore is one line away from being edited back.)
//   2. an `env:` block on an eas.json profile, which EAS injects at build time.
// Wider than LOCAL_HOST on purpose. Source code hardcodes the emulator alias or loopback;
// CONFIG is where someone writes their actual LAN address, because that is what a phone on
// the same wifi needs — and RFC1918 is exactly the range that means "only routable on the
// machine that wrote it".
const OCTET = "[0-9]{1,3}"
const PRIVATE_HOST = new RegExp(
  [
    LOCAL_HOST.source,
    "10[.]" + OCTET + "[.]" + OCTET + "[.]" + OCTET,
    "192[.]168[.]" + OCTET + "[.]" + OCTET,
    "172[.](1[6-9]|2[0-9]|3[01])[.]" + OCTET + "[.]" + OCTET,
  ].join("|"),
)

it('keeps developer-machine addresses out of build configuration', () => {
  const offenders: string[] = []

  for (const name of readdirSync(MOBILE)) {
    if (!name.startsWith('.env') || name === '.env.example') continue
    if (PRIVATE_HOST.test(readFileSync(join(MOBILE, name), 'utf8'))) offenders.push(name)
  }

  for (const [profile, cfg] of Object.entries(easJson.build) as [string, any][]) {
    const env = Object.values(cfg.env ?? {}).join(' ')
    if (PRIVATE_HOST.test(env)) offenders.push(`eas.json build.${profile}.env`)
  }

  expect(offenders).toEqual([])
})
