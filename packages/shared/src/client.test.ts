import { createClient } from './client'
import { StorageAdapter, STORAGE_KEYS } from './storage'

const memStorage = (): StorageAdapter => {
  const m = new Map<string, string>()
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => { m.set(k, v) },
    remove: async (k) => { m.delete(k) },
  }
}

const captureClient = () => {
  const calls: Array<{ url?: string; params?: any }> = []
  const client = createClient(memStorage())
  client.api.defaults.adapter = async (config: any) => {
    calls.push({ url: config.url, params: config.params })
    return { data: { data: [] }, status: 200, statusText: 'OK', headers: {}, config }
  }
  return { client, calls }
}

describe('foodAPI day windowing', () => {
  it('list sends only the day — the server buckets it in the user timezone', async () => {
    const { client, calls } = captureClient()
    await client.foodAPI.list('2026-06-15')
    expect(calls[0].url).toBe('/food')
    expect(calls[0].params).toEqual({
      date: '2026-06-15',
    })
  })

  it('stats sends only the day — the server buckets it in the user timezone', async () => {
    const { client, calls } = captureClient()
    await client.foodAPI.stats('2026-11-01')
    expect(calls[0].url).toBe('/food/stats')
    expect(calls[0].params).toEqual({
      date: '2026-11-01',
    })
  })

  it('sends no day params when date is omitted', async () => {
    const { client, calls } = captureClient()
    await client.foodAPI.list()
    expect(calls[0].params).toEqual({})
  })
})

// The offset must describe the instant being sent. A screen that re-picks the date
// derives a new instant in this zone and wants this zone's offset; a screen that
// resends the timestamp it loaded must keep the offset that instant was recorded with,
// or an edit that never touched the date moves the workout's day.
describe('workoutAPI tz_offset_minutes', () => {
  const captureBody = () => {
    const calls: Array<{ url?: string; body: any }> = []
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      calls.push({ url: config.url, body: JSON.parse(config.data ?? '{}') })
      return { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }
    }
    return { client, calls }
  }

  it('update keeps an offset the caller supplied', async () => {
    const { client, calls } = captureBody()
    await client.workoutAPI.update(1, {
      name: 'Rep fix only',
      started_at: '2026-07-01T23:00:00Z',
      tz_offset_minutes: -240,
    })
    expect(calls[0].body.tz_offset_minutes).toBe(-240)
  })

  it('update stamps this zone only when the caller sends no offset', async () => {
    const { client, calls } = captureBody()
    const startedAt = '2026-07-01T23:00:00Z'
    await client.workoutAPI.update(1, { name: 'Re-dated', started_at: startedAt })
    expect(calls[0].body.tz_offset_minutes).toBe(-new Date(startedAt).getTimezoneOffset())
  })

  it('a zero offset is preserved rather than treated as absent', async () => {
    const { client, calls } = captureBody()
    await client.workoutAPI.update(1, {
      name: 'Logged at UTC',
      started_at: '2026-07-01T12:00:00Z',
      tz_offset_minutes: 0,
    })
    expect(calls[0].body.tz_offset_minutes).toBe(0)
  })
})

// A workout logged before the offset column existed has no stored offset, so the edit
// screen names the field with an undefined value. That must reach the server as absent
// — letting it fall back to the account zone — rather than being stamped with wherever
// the person editing happens to be standing.
describe('workoutAPI tz_offset_minutes on legacy rows', () => {
  it('sends no offset when the caller names the field with no value', async () => {
    const calls: Array<{ body: any }> = []
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      calls.push({ body: JSON.parse(config.data ?? '{}') })
      return { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }
    }
    await client.workoutAPI.update(1, {
      name: 'Legacy row',
      started_at: '2026-07-01T23:00:00Z',
      tz_offset_minutes: undefined,
    })
    expect('tz_offset_minutes' in calls[0].body).toBe(false)
  })
})

// The unparameterised exercise list is fetched once and cached, because it is ~820 KB
// and every picker opens with an empty search box.
describe('exerciseAPI.list caching', () => {
  // Adapter that fails the first N calls, then succeeds, counting requests.
  const flakyClient = (failures: number) => {
    let calls = 0
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      calls += 1
      if (calls <= failures) throw new Error('network')
      return {
        data: { data: [{ id: 1, name: 'Bench Press' }] },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }
    return { client, count: () => calls }
  }

  it('fetches once and serves later calls from cache', async () => {
    const { client, count } = flakyClient(0)
    await client.exerciseAPI.list()
    await client.exerciseAPI.list()
    expect(count()).toBe(1)
  })

  it('recovers after a failed fetch instead of caching the rejection forever', async () => {
    // Clearing the in-flight promise only on success left a rejected promise cached for
    // the life of the page: every later call replayed that same rejection, so one
    // dropped request while the picker was opening broke the picker until a reload.
    const { client, count } = flakyClient(1)

    await expect(client.exerciseAPI.list()).rejects.toThrow()
    await expect(client.exerciseAPI.list()).resolves.toHaveLength(1)
    expect(count()).toBe(2)
  })

  it('still surfaces the failure to the caller — it only stops caching it', async () => {
    const { client } = flakyClient(1)
    await expect(client.exerciseAPI.list()).rejects.toThrow('network')
  })

  it('does not cache filtered searches', async () => {
    const { client, count } = flakyClient(0)
    await client.exerciseAPI.list({ q: 'bench' })
    await client.exerciseAPI.list({ q: 'bench' })
    expect(count()).toBe(2)
  })
})

// Web had no request timeout at all before adopting this client. The global 20s is
// right for small reads, but two screens legitimately ask for a lot of rows.
describe('list timeouts scale with the requested limit', () => {
  const timeoutClient = () => {
    const seen: Array<{ url?: string; timeout?: number }> = []
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      seen.push({ url: config.url, timeout: config.timeout })
      return { data: { data: [] }, status: 200, statusText: 'OK', headers: {}, config }
    }
    return { client, seen }
  }

  it('gives the dashboard 84-workout fetch the bulk bound, not 20s', async () => {
    const { client, seen } = timeoutClient()
    await client.workoutAPI.list({ limit: 84 })
    expect(seen[0].timeout).toBe(60000)
  })

  it('gives the weight page limit:1000 fetch the bulk bound', async () => {
    const { client, seen } = timeoutClient()
    await client.weightAPI.list({ limit: 1000 })
    expect(seen[0].timeout).toBe(60000)
  })

  it('leaves ordinary paginated reads on the tight global bound', async () => {
    const { client, seen } = timeoutClient()
    await client.workoutAPI.list({ limit: 20 })
    await client.weightAPI.list()
    expect(seen[0].timeout).toBe(20000)
    expect(seen[1].timeout).toBe(20000)
  })
})

// The change invalidates every token minted against the old password — including the
// pair this device is holding. Persisting the replacements is what keeps the session
// that made the change alive; drop them and the user is signed out minutes later, at
// the next refresh, with nothing on screen to connect it to what they did.
describe('userAPI.changePassword', () => {
  const clientWithStorage = () => {
    const store = memStorage()
    const client = createClient(store)
    client.api.defaults.adapter = async (config: any) => ({
      data: { data: { token: 'new-access', refresh_token: 'new-refresh' } },
      status: 200, statusText: 'OK', headers: {}, config,
    })
    return { client, store }
  }

  it('persists the token pair the server returns', async () => {
    const { client, store } = clientWithStorage()
    await store.set(STORAGE_KEYS.access, 'old-access')
    await store.set(STORAGE_KEYS.refresh, 'old-refresh')

    await client.userAPI.changePassword({
      current_password: 'password123',
      new_password: 'newpassword456',
    })

    expect(await store.get(STORAGE_KEYS.access)).toBe('new-access')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('new-refresh')
  })

  // A 401 here means "that current password is wrong", not "your session lapsed". If the
  // refresh interceptor treats it as the latter it retries, fails again, and signs the
  // user out — losing the session over a typo.
  it('does not trigger the refresh-and-sign-out path on a rejected password', async () => {
    const store = memStorage()
    let signedOut = false
    const client = createClient(store, { onAuthFailure: () => { signedOut = true } })
    client.api.defaults.adapter = async (config: any) => {
      const err: any = new Error('Request failed with status code 401')
      err.config = config
      err.response = {
        status: 401, data: { error: 'current password is incorrect' },
        statusText: 'Unauthorized', headers: {}, config,
      }
      throw err
    }
    await store.set(STORAGE_KEYS.access, 'live-access')
    await store.set(STORAGE_KEYS.refresh, 'live-refresh')

    await expect(client.userAPI.changePassword({
      current_password: 'wrong', new_password: 'newpassword456',
    })).rejects.toBeDefined()

    expect(signedOut).toBe(false)
    expect(await store.get(STORAGE_KEYS.access)).toBe('live-access')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('live-refresh')
  })
})
