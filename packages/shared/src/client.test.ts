import axios from 'axios'
import { apiErrorMessage, createClient } from './client'
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

// The exercise catalog is not the client's to hold. It lives in open-exercise-db,
// the server queries it and returns a page at a time, and the browser keeps only
// what it is showing.
describe('exerciseAPI.list is server-side and unbuffered', () => {
  // Adapter that records the params of every request and answers with one row.
  const recordingClient = () => {
    const seen: any[] = []
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      seen.push(config.params)
      return {
        data: { data: [{ id: 1, name: 'Bench Press' }] },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }
    return { client, seen }
  }

  // The previous client cached the whole unfiltered catalog on first call, which is
  // what made every app instance a copy of a database it does not own. Repeating a
  // request must reach the server, whose own cache holds upstream responses for five
  // minutes and answers it for free.
  it('sends every call to the server, including repeats', async () => {
    const { client, seen } = recordingClient()
    await client.exerciseAPI.list()
    await client.exerciseAPI.list()
    expect(seen).toHaveLength(2)
  })

  it('asks for one page by default rather than the whole catalog', async () => {
    const { client, seen } = recordingClient()
    await client.exerciseAPI.list()
    expect(seen[0].limit).toBe(50)
    expect(seen[0].limit).toBeLessThanOrEqual(100) // the server's per-page ceiling
  })

  it('forwards paging and filters', async () => {
    const { client, seen } = recordingClient()
    await client.exerciseAPI.list({ q: 'bench', page: 3 })
    expect(seen[0]).toMatchObject({ q: 'bench', page: 3, limit: 50 })
  })

  it('lets an explicit limit override the default', async () => {
    const { client, seen } = recordingClient()
    await client.exerciseAPI.list({ limit: 10 })
    expect(seen[0].limit).toBe(10)
  })

  // A failure must reach the caller rather than being swallowed or, as the cached
  // version once did, replayed to every later call for the life of the page.
  it('surfaces failures to the caller', async () => {
    const client = createClient(memStorage())
    client.api.defaults.adapter = async () => { throw new Error('network') }
    await expect(client.exerciseAPI.list()).rejects.toThrow('network')
  })

  it('recovers on the next call after a failure', async () => {
    let calls = 0
    const client = createClient(memStorage())
    client.api.defaults.adapter = async (config: any) => {
      calls += 1
      if (calls === 1) throw new Error('network')
      return {
        data: { data: [{ id: 1, name: 'Bench Press' }] },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }
    await expect(client.exerciseAPI.list()).rejects.toThrow()
    await expect(client.exerciseAPI.list()).resolves.toHaveLength(1)
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

// #145: "action buttons stop responding … requires a full app restart". The reporter's
// two clues named the mechanism exactly — it happened when connectivity to their
// homelab dropped, and it cleared "immediately" once the connection came back. Nothing
// was frozen; one promise had simply never settled, and a button gated on it stayed
// disabled for the life of the process.
//
// The gap was that the refresh POST is issued on the bare `axios` export rather than on
// `api` (using `api` would recurse into the interceptor that issues it), so it inherited
// axios's own default of `timeout: 0` — wait forever — while every other request in the
// app was bounded. Reproduced on an emulator against a proxy that black-holed only
// /auth/refresh: 401 → refresh → silence, and Finish sat on "Saving…" through six taps
// and two minutes with the workout timer still ticking beside it.
describe('a token refresh nobody answers (#145)', () => {
  const realAdapter = axios.defaults.adapter
  afterEach(() => { axios.defaults.adapter = realAdapter })

  // Every data request 401s; `onRefresh` decides what the refresh POST does. Note the
  // adapters are set on different objects on purpose: axios.create() captures defaults at
  // construction, so client.api keeps its own adapter and the global one is reached only
  // by the bare axios.post in the interceptor — which is the call under test.
  const withRefresh = (onRefresh: (config: any) => Promise<any>) => {
    const store = memStorage()
    let signedOut = false
    const client = createClient(store, { onAuthFailure: () => { signedOut = true } })
    client.api.defaults.adapter = async (config: any) => {
      throw httpError(401, config)
    }
    axios.defaults.adapter = onRefresh as any
    return { client, store, wasSignedOut: () => signedOut }
  }

  const httpError = (status: number, config: any) => {
    const err: any = new Error(`Request failed with status code ${status}`)
    err.config = config
    err.response = { status, data: {}, statusText: '', headers: {}, config }
    return err
  }

  // What axios throws when it gives up on its own timeout — no `response` at all.
  const silence = () => {
    const err: any = new Error('timeout of 20000ms exceeded')
    err.code = 'ECONNABORTED'
    return err
  }

  const signedIn = async (store: StorageAdapter) => {
    await store.set(STORAGE_KEYS.access, 'live-access')
    await store.set(STORAGE_KEYS.refresh, 'live-refresh')
    await store.set(STORAGE_KEYS.user, '{"id":1}')
  }

  it('bounds the refresh, so the caller always settles instead of hanging forever', async () => {
    let seen: any
    const { client, store } = withRefresh(async (config) => { seen = config; throw silence() })
    await signedIn(store)

    await expect(client.userAPI.me()).rejects.toBeDefined()

    expect(seen.timeout).toBe(20000)
  })

  // Silence is not a verdict. Only the server can say a session is over, and a request
  // that never arrived carries no answer — signing out on it ends a live workout every
  // time someone walks past a dead spot in their gym's wifi. Verified before the fix:
  // restoring connectivity after a hung refresh dropped a running workout to the login
  // screen, losing it.
  it('keeps the session when the refresh times out', async () => {
    const { client, store, wasSignedOut } = withRefresh(async () => { throw silence() })
    await signedIn(store)

    // The caller hears about the silence, not about the 401 that started it. Surfacing
    // the original made the sheet read "invalid or expired token" - which says "your
    // login is broken" when the login is fine and the phone simply could not reach the
    // server. Seen on the emulator before this line existed.
    await expect(client.userAPI.me()).rejects.toMatchObject({ code: 'ECONNABORTED' })

    expect(wasSignedOut()).toBe(false)
    expect(await store.get(STORAGE_KEYS.access)).toBe('live-access')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('live-refresh')
    expect(await store.get(STORAGE_KEYS.user)).toBe('{"id":1}')
  })

  // A reverse proxy that is up while the backend behind it is not answers 502/504. Same
  // reasoning: the server never evaluated the refresh token, so it has not been revoked.
  it.each([500, 502, 504])('keeps the session when the refresh gets a %i', async (status) => {
    const { client, store, wasSignedOut } = withRefresh(async (config) => { throw httpError(status, config) })
    await signedIn(store)

    await expect(client.userAPI.me()).rejects.toBeDefined()

    expect(wasSignedOut()).toBe(false)
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('live-refresh')
  })

  // The other half: a real verdict must still end the session, or an expired refresh
  // token would leave the app retrying a dead session forever. 400 is the backend
  // rejecting a missing/malformed refresh_token; 401 is it rejecting the token itself.
  it.each([400, 401, 403])('ends the session when the server answers %i', async (status) => {
    const { client, store, wasSignedOut } = withRefresh(async (config) => { throw httpError(status, config) })
    await signedIn(store)

    await expect(client.userAPI.me()).rejects.toBeDefined()

    expect(wasSignedOut()).toBe(true)
    expect(await store.get(STORAGE_KEYS.access)).toBeNull()
    expect(await store.get(STORAGE_KEYS.refresh)).toBeNull()
    expect(await store.get(STORAGE_KEYS.user)).toBeNull()
  })

  // The reporter's "as soon as the connection was re-established it worked again": a
  // refresh that does come back still has to hand the retried request its new token.
  it('retries the original request once the refresh succeeds', async () => {
    const store = memStorage()
    const client = createClient(store)
    let attempts = 0
    client.api.defaults.adapter = async (config: any) => {
      attempts += 1
      if (attempts === 1) throw httpError(401, config)
      return { data: { data: { id: 1 } }, status: 200, statusText: 'OK', headers: {}, config }
    }
    axios.defaults.adapter = (async (config: any) => ({
      data: { data: { token: 'fresh-access', refresh_token: 'fresh-refresh' } },
      status: 200, statusText: 'OK', headers: {}, config,
    })) as any
    await signedIn(store)

    await expect(client.userAPI.me()).resolves.toEqual({ id: 1 })

    expect(attempts).toBe(2)
    expect(await store.get(STORAGE_KEYS.access)).toBe('fresh-access')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('fresh-refresh')
  })
  // Five reads firing on one screen mount all 401 together. Before single-flight each
  // opened its own refresh: five round-trips, five rotations of a token the server
  // invalidates as it reissues it, and whichever landed last won the storage key - so
  // some of the retries went out holding a token that was already dead. On the flaky
  // network this whole bug is about, it was also five separate 20s waits.
  it('opens one refresh for a burst of 401s, and retries them all on its token', async () => {
    const store = memStorage()
    const client = createClient(store)
    let refreshes = 0
    const retryTokens: string[] = []
    client.api.defaults.adapter = async (config: any) => {
      const auth = String(config.headers?.Authorization ?? '')
      if (auth !== 'Bearer fresh-access') throw httpError(401, config)
      retryTokens.push(auth)
      return { data: { data: { ok: true } }, status: 200, statusText: 'OK', headers: {}, config }
    }
    axios.defaults.adapter = (async (config: any) => {
      refreshes += 1
      // Resolve on a later turn so all five 401s are in the catch before the first
      // refresh settles - without that the test would pass even with no sharing.
      await new Promise((r) => setTimeout(r, 10))
      return {
        data: { data: { token: 'fresh-access', refresh_token: 'fresh-refresh' } },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }) as any
    await signedIn(store)

    await Promise.all([
      client.userAPI.me(), client.userAPI.me(), client.userAPI.me(),
      client.userAPI.me(), client.userAPI.me(),
    ])

    expect(refreshes).toBe(1)
    expect(retryTokens).toEqual(Array(5).fill('Bearer fresh-access'))
  })

  // The shared promise has to be released when it settles, or one dead refresh would
  // poison every later attempt for the life of the process.
  it('starts a new refresh after the shared one has settled', async () => {
    const store = memStorage()
    const client = createClient(store)
    let refreshes = 0
    client.api.defaults.adapter = async (config: any) => { throw httpError(401, config) }
    axios.defaults.adapter = (async () => { refreshes += 1; throw silence() }) as any
    await signedIn(store)

    await expect(client.userAPI.me()).rejects.toBeDefined()
    await expect(client.userAPI.me()).rejects.toBeDefined()

    expect(refreshes).toBe(2)
  })
})

// What a self-hoster meets every time they update the stack: nginx is up, the app behind
// it is not, and the reply is a web page rather than our envelope. Reporting the caller's
// fallback there ("Couldn't save your workout") blames the app for an infrastructure
// problem and sends the user looking in the wrong place. wger's client models this
// explicitly for the same reason.
describe('apiErrorMessage on a reply that is not ours', () => {
  const replied = (status: number, data: any) => ({ response: { status, data } })

  it('names an HTML page for what it is', () => {
    const msg = apiErrorMessage(replied(502, '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>'), 'Failed to save')
    expect(msg).toMatch(/web page/i)
    expect(msg).not.toBe('Failed to save')
  })

  it('tells a restarting proxy apart from our own code failing', () => {
    expect(apiErrorMessage(replied(503, {}), 'x')).toMatch(/restarting or unreachable/i)
    expect(apiErrorMessage(replied(500, {}), 'x')).toMatch(/Server error/i)
  })

  it('still prefers what the server actually said', () => {
    expect(apiErrorMessage(replied(422, { error: 'Password must be at least 8 characters.' }), 'x'))
      .toBe('Password must be at least 8 characters.')
  })
})
