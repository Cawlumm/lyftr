// Pins the Hermes path. Hermes ships no Intl.PluralRules, and i18next >=24 has no fallback
// without it, so Spanish _one/_many would silently never resolve. polyfills.ts is the
// module the app entry imports first; this proves it supplies PluralRules and that
// i18next then picks the right forms from the shared catalog.

jest.mock('react-native-gesture-handler', () => ({}))
jest.mock('react-native-url-polyfill/auto', () => ({}))

describe('Intl.PluralRules on a runtime without it', () => {
  const real = Intl.PluralRules

  afterAll(() => {
    ;(Intl as any).PluralRules = real
  })

  it('is installed by polyfills and drives plural keys in es', async () => {
    delete (Intl as any).PluralRules
    expect(typeof Intl.PluralRules).toBe('undefined')

    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    const warns = jest.spyOn(console, 'warn').mockImplementation(() => {})

    let shared: typeof import('@lyftr/shared')
    /* eslint-disable @typescript-eslint/no-require-imports */
    jest.isolateModules(() => {
      require('./polyfills')
      shared = require('@lyftr/shared')
    })

    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(typeof Intl.PluralRules).toBe('function')

    const { i18n } = shared!
    await i18n.changeLanguage('es')
    const t = (count: number) => i18n.t('settings.library.refreshed', { count, amount: String(count) })
    expect(t(1)).toBe('Se actualizó 1 ejercicio')
    expect(t(2)).toBe('Se actualizaron 2 ejercicios')
    // The polyfill lists the same es categories as Node's ICU, so the catalog guard's key
    // set is right on device. (Its `many` rule is older and does not fire for 1000000 the
    // way Node's does; that gap is a known difference, not something to pin here.)
    expect(new Intl.PluralRules('es').resolvedOptions().pluralCategories).toEqual(['one', 'many', 'other'])

    const calls = [...errors.mock.calls, ...warns.mock.calls].map((c) => c.join(' '))
    expect(calls.filter((c) => c.includes('Intl'))).toEqual([])
    errors.mockRestore()
    warns.mockRestore()
  })
})
