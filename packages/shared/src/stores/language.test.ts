import { createLanguageStore } from './language'
import { i18n } from '../i18n'
import { createMemoryStorage } from '../testing/memoryStorage'

afterEach(async () => { await i18n.changeLanguage('en') })

describe('language store', () => {
  // Hydration gates app start on mobile, so an unreadable store must not strand it.
  it('hydrates as system when the stored value cannot be read', async () => {
    const storage = { ...createMemoryStorage(), get: async () => { throw new Error('keychain locked') } }
    const store = createLanguageStore(storage, () => ['es-ES'])
    await store.getState().hydrate()
    expect(store.getState().isHydrated).toBe(true)
    expect(store.getState().preference).toBe('system')
    expect(i18n.language).toBe('es')
  })

  it('still switches language when the choice cannot be saved', async () => {
    const storage = { ...createMemoryStorage(), set: async () => { throw new Error('private mode') } }
    const store = createLanguageStore(storage, () => ['en-US'])
    await store.getState().setPreference('es')
    expect(store.getState().preference).toBe('es')
    expect(i18n.language).toBe('es')
  })

  it('follows the device when nothing is stored', async () => {
    const store = createLanguageStore(createMemoryStorage(), () => ['es-ES'])
    await store.getState().hydrate()
    expect(store.getState().preference).toBe('system')
    expect(store.getState().isHydrated).toBe(true)
    expect(i18n.language).toBe('es')
  })

  it('a stored choice beats the device', async () => {
    const store = createLanguageStore(createMemoryStorage({ lyftr_language: 'en' }), () => ['es'])
    await store.getState().hydrate()
    expect(store.getState().preference).toBe('en')
    expect(i18n.language).toBe('en')
  })

  it('treats an unknown stored value as system', async () => {
    const store = createLanguageStore(createMemoryStorage({ lyftr_language: 'klingon' }), () => [])
    await store.getState().hydrate()
    expect(store.getState().preference).toBe('system')
  })

  it('persists and applies a new preference', async () => {
    const storage = createMemoryStorage()
    const store = createLanguageStore(storage, () => [])
    await store.getState().setPreference('es')
    expect(storage.dump()['lyftr_language']).toBe('es')
    expect(i18n.language).toBe('es')
  })

  it('falls back to English when detection throws', async () => {
    const store = createLanguageStore(createMemoryStorage(), () => { throw new Error('no module') })
    await store.getState().hydrate()
    expect(store.getState().isHydrated).toBe(true)
    expect(i18n.language).toBe('en')
  })
})
