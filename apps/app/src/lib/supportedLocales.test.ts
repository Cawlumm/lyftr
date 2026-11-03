// app.json cannot import the language registry, so this test is what keeps the OS per-app
// language list and the in-app list the same. The allowDynamicLocaleChangesAndroid assertion
// pins a plugin quirk: its default applies only when no options object is passed, so passing
// supportedLocales alone would drop locale|layoutDirection from MainActivity's configChanges.

jest.mock('react-native-gesture-handler', () => ({}))
jest.mock('react-native-url-polyfill/auto', () => ({}))

import { SUPPORTED_LANGUAGES } from '@lyftr/shared'
import appJson from '../../app.json'

type Options = {
  supportedLocales: { ios: string[]; android: string[] }
  allowDynamicLocaleChangesAndroid: boolean
}

describe('expo-localization plugin config', () => {
  const entry = (appJson.expo.plugins as unknown[]).find(
    (p) => Array.isArray(p) && p[0] === 'expo-localization',
  ) as [string, Options] | undefined

  it('registers exactly the supported languages with iOS and Android', () => {
    expect(entry).toBeDefined()
    const want = [...SUPPORTED_LANGUAGES].sort()
    expect([...entry![1].supportedLocales.ios].sort()).toEqual(want)
    expect([...entry![1].supportedLocales.android].sort()).toEqual(want)
  })

  it('keeps allowDynamicLocaleChangesAndroid on', () => {
    expect(entry![1].allowDynamicLocaleChangesAndroid).toBe(true)
  })
})
