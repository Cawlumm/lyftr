#!/usr/bin/env node
// adb reverse for Metro and the backend, without requiring adb on PATH.
//
// `adb reverse tcp:8081` is Expo's own remedy when a device or emulator cannot reach the
// dev server (their device guide lists it for exactly that). It is needed more often than
// the docs imply: an emulator reaches the host through 10.0.2.2, which arrives as an
// EXTERNAL connection, so a host firewall — or Metro binding to loopback — drops it. The
// symptom is not an error but a splash screen that never advances, which is why this is
// worth a script rather than a line in someone's shell history.
//
// adb lives in the Android SDK, and putting platform-tools on PATH is a setup step people
// skip on Windows, so resolve it the way Expo's own CLI does: ANDROID_HOME first, then
// ANDROID_SDK_ROOT, then PATH.
const { execFileSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const PORTS = [
  ['8081', 'Metro'],
  ['3000', 'the backend'],
]

function resolveAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb'
  for (const root of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (!root) continue
    const candidate = join(root, 'platform-tools', exe)
    if (existsSync(candidate)) return candidate
  }
  // Windows installs it here by default even when neither variable is set.
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const candidate = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe)
    if (existsSync(candidate)) return candidate
  }
  return exe // let PATH answer, and let the error below explain if it cannot
}

const adb = resolveAdb()
try {
  for (const [port, what] of PORTS) {
    execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'pipe' })
    console.log(`  ${port} → ${what}`)
  }
  console.log('\nDevice can now reach both on 127.0.0.1. Open exp://127.0.0.1:8081 and set')
  console.log('the app\'s server URL to http://127.0.0.1:3000.')
} catch (err) {
  console.error(`Could not run adb reverse (${adb}).`)
  console.error('Is a device attached (`adb devices`) and the Android SDK installed?')
  console.error(String(err.stderr || err.message).trim())
  process.exit(1)
}
