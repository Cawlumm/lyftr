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

describe('settings store — reset keeps device prefs', () => {
  // The three client-only prefs live under their own storage keys and belong to the
  // device, not the account. Sign-out clears the auth tokens, not those keys, and
  // hydratePrefs() only runs once at startup — so if reset() dropped them the store
  // would claim 'list' while storage still said 'gym', with nothing to correct it
  // until the next settings fetch returned.
  const prefStorage = () => {
    const s = createMemoryStorage()
    s.set('lyftr_workout_layout', 'gym')
    s.set('lyftr_rest_enabled', 'false')
    s.set('lyftr_rest_seconds', '120')
    return s
  }

  it('preserves workout_layout, rest_enabled and rest_seconds_default', async () => {
    const { client } = fakeClient(serverSettings())
    const store = createSettingsStore(client, prefStorage())

    await store.getState().hydratePrefs()
    expect(store.getState().settings.workout_layout).toBe('gym')

    store.getState().reset()

    expect(store.getState().settings.workout_layout).toBe('gym')
    expect(store.getState().settings.rest_enabled).toBe(false)
    expect(store.getState().settings.rest_seconds_default).toBe(120)
  })

  it('still clears the server-owned settings and the loaded flag', async () => {
    const { client } = fakeClient(serverSettings({ weight_unit: 'kg', calorie_target: 3100 }))
    const store = createSettingsStore(client, prefStorage())

    await store.getState().fetch()
    expect(store.getState().settings.calorie_target).toBe(3100)
    expect(store.getState().loaded).toBe(true)

    store.getState().reset()

    expect(store.getState().settings.weight_unit).toBe('lbs')
    expect(store.getState().settings.calorie_target).toBe(2000)
    expect(store.getState().loaded).toBe(false)
    // ...but not the device prefs.
    expect(store.getState().settings.workout_layout).toBe('gym')
  })
})

describe('settings store — a write that fails', () => {
  // The optimistic set is the point of the store, and it was also the bug: on a failed
  // PUT the app went on showing a unit the server had refused, and the next launch read
  // the real value back and flipped it, with nothing ever having said why.
  it('rolls its own optimistic patch back', async () => {
    const { client } = fakeClient(serverSettings({ weight_unit: 'lbs' }), { fail: true })
    const store = createSettingsStore(client, createMemoryStorage())

    await store.getState().fetch()
    expect(store.getState().settings.weight_unit).toBe('lbs')

    await expect(store.getState().update({ weight_unit: 'kg' })).rejects.toThrow('network')

    expect(store.getState().settings.weight_unit).toBe('lbs')
  })

  it('rethrows, because rolling back is not the same as telling the user', async () => {
    const { client } = fakeClient(serverSettings(), { fail: true })
    const store = createSettingsStore(client, createMemoryStorage())
    await store.getState().fetch()

    await expect(store.getState().update({ calorie_target: 3000 })).rejects.toBeInstanceOf(Error)
  })

  it('shows the new value while the write is still in flight', async () => {
    const { client, release } = fakeClient(serverSettings({ weight_unit: 'lbs' }), { fail: true, defer: true })
    const store = createSettingsStore(client, createMemoryStorage())
    await store.getState().fetch()

    const pending = store.getState().update({ weight_unit: 'kg' }).catch(() => {})
    expect(store.getState().settings.weight_unit).toBe('kg')

    release()
    await pending
    expect(store.getState().settings.weight_unit).toBe('lbs')
  })

  it('restores only the keys the failed patch touched', async () => {
    const { client } = fakeClient(serverSettings({ calorie_target: 2000 }), { fail: true })
    const store = createSettingsStore(client, createMemoryStorage())
    await store.getState().fetch()

    await expect(store.getState().update({ calorie_target: 3000 })).rejects.toThrow()

    expect(store.getState().settings.calorie_target).toBe(2000)
    // Untouched by the patch, so untouched by the rollback.
    expect(store.getState().settings.protein_target).toBe(150)
  })
})
