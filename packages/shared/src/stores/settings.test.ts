import { createSettingsStore } from './settings'
import { createMemoryStorage } from '../testing/memoryStorage'
import type { LyftrClient } from '../client'
import type { UserSettings } from '../types'

const serverSettings = (over: Partial<UserSettings> = {}): UserSettings => ({
  user_id: 1,
  weight_unit: 'lbs',
  calorie_target: 2000,
  protein_target: 150,
  carb_target: 250,
  fat_target: 65,
  workout_layout: 'list',
  rest_enabled: true,
  rest_seconds_default: 90,
  timezone: 'UTC',
  ...over,
})

// Records what updateSettings was called with so a test can assert the PATCH did or
// did not happen, and can control when it resolves.
function fakeClient(stored: UserSettings, opts: { fail?: boolean; defer?: boolean } = {}) {
  const calls: Partial<UserSettings>[] = []
  let release: (() => void) | undefined
  const gate = opts.defer ? new Promise<void>((r) => { release = r }) : Promise.resolve()

  const client = {
    userAPI: {
      getSettings: async () => stored,
      updateSettings: async (patch: Partial<UserSettings>) => {
        calls.push(patch)
        await gate
        if (opts.fail) throw new Error('network')
        return { ...stored, ...patch }
      },
    },
  } as unknown as LyftrClient

  return { client, calls, release: () => release?.() }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('settings store — timezone sync', () => {
  it('pushes the device zone up when it differs from the stored one', async () => {
    const { client, calls } = fakeClient(serverSettings({ timezone: 'UTC' }))
    const store = createSettingsStore(client, createMemoryStorage(), () => 'America/New_York')

    await store.getState().fetch()
    await flush()

    expect(calls).toEqual([{ timezone: 'America/New_York' }])
    expect(store.getState().settings.timezone).toBe('America/New_York')
  })

  it('does not PATCH when the stored zone already matches', async () => {
    const { client, calls } = fakeClient(serverSettings({ timezone: 'America/New_York' }))
    const store = createSettingsStore(client, createMemoryStorage(), () => 'America/New_York')

    await store.getState().fetch()
    await flush()

    expect(calls).toEqual([])
  })

  it('sends nothing when the platform cannot resolve a zone', async () => {
    // Hermes does not expose the device zone to JS, so mobile's detector can return
    // null. That must leave the server's value alone rather than writing a guess.
    const { client, calls } = fakeClient(serverSettings({ timezone: 'Europe/Berlin' }))
    const store = createSettingsStore(client, createMemoryStorage(), () => null)

    await store.getState().fetch()
    await flush()

    expect(calls).toEqual([])
    expect(store.getState().settings.timezone).toBe('Europe/Berlin')
  })

  it('sends nothing when no detector is injected at all', async () => {
    const { client, calls } = fakeClient(serverSettings())
    const store = createSettingsStore(client, createMemoryStorage())

    await store.getState().fetch()
    await flush()

    expect(calls).toEqual([])
  })

  it('survives a detector that throws', async () => {
    const { client, calls } = fakeClient(serverSettings())
    const store = createSettingsStore(client, createMemoryStorage(), () => {
      throw new Error('no Intl')
    })

    await expect(store.getState().fetch()).resolves.toBeUndefined()
    await flush()
    expect(calls).toEqual([])
    expect(store.getState().loaded).toBe(true)
  })

  it('swallows a failed PATCH and keeps the settings it already loaded', async () => {
    const { client } = fakeClient(serverSettings({ timezone: 'UTC', calorie_target: 2222 }), { fail: true })
    const store = createSettingsStore(client, createMemoryStorage(), () => 'America/New_York')

    await store.getState().fetch()
    await flush()

    expect(store.getState().loaded).toBe(true)
    expect(store.getState().settings.calorie_target).toBe(2222)
  })

  it('marks settings loaded without waiting for the timezone PATCH', async () => {
    // The sync is a background nicety. Awaiting it would hold every settings-gated
    // screen on its loading state behind a stalled write.
    const { client, release } = fakeClient(serverSettings({ timezone: 'UTC' }), { defer: true })
    const store = createSettingsStore(client, createMemoryStorage(), () => 'America/New_York')

    await store.getState().fetch()
    expect(store.getState().loaded).toBe(true)

    release()
    await flush()
    expect(store.getState().settings.timezone).toBe('America/New_York')
  })

  it('does not clobber a settings change made while the PATCH was in flight', async () => {
    // The PATCH response carries the pre-edit values for every other field, so
    // writing it wholesale would silently revert the user's edit.
    const { client, release } = fakeClient(serverSettings({ timezone: 'UTC', weight_unit: 'lbs' }), { defer: true })
    const store = createSettingsStore(client, createMemoryStorage(), () => 'America/New_York')

    await store.getState().fetch()
    store.setState((s) => ({ settings: { ...s.settings, weight_unit: 'kg' } }))

    release()
    await flush()

    expect(store.getState().settings.weight_unit).toBe('kg')
    expect(store.getState().settings.timezone).toBe('America/New_York')
  })
})
