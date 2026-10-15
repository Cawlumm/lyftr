import axios from 'axios'
import { apiErrorMessage, createClient, uiMessage } from './client'
import { i18n } from './i18n'
import en from './i18n/locales/en.json'
import es from './i18n/locales/es.json'
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

describe('userAPI.changeEmail', () => {
  it('PUTs the address and password, returns the user and swaps in the new token pair', async () => {
    const store = memStorage()
    const client = createClient(store)
    let sent: any
    client.api.defaults.adapter = async (config: any) => {
      sent = { method: config.method, url: config.url, data: JSON.parse(config.data) }
      return {
        data: { data: {
          token: 'new-access', refresh_token: 'new-refresh',
          user: { id: 1, email: 'new@x.com', created_at: '2026-01-01T00:00:00Z' },
        } },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }
    await store.set(STORAGE_KEYS.access, 'live-access')
    await store.set(STORAGE_KEYS.refresh, 'live-refresh')

    const user = await client.userAPI.changeEmail({ email: 'new@x.com', current_password: 'pw' })

    expect(sent).toEqual({ method: 'put', url: '/me/email', data: { email: 'new@x.com', current_password: 'pw' } })
    expect(user.email).toBe('new@x.com')
    // The change ends every session on the old version, this one included, so this device
    // has to carry the pair the server handed back or it is signed out at the next refresh.
    expect(await store.get(STORAGE_KEYS.access)).toBe('new-access')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('new-refresh')
  })

  it('does not trigger the refresh-and-sign-out path on a rejected password', async () => {
    const store = memStorage()
    let signedOut = false
    const client = createClient(store, { onAuthFailure: () => { signedOut = true } })
    client.api.defaults.adapter = async (config: any) => {
      const err: any = new Error('Request failed with status code 401')
      err.config = config
      err.response = {
        status: 401, data: { error: 'Your current password is incorrect.' },
        statusText: 'Unauthorized', headers: {}, config,
      }
      throw err
    }
    await store.set(STORAGE_KEYS.access, 'live-access')
    await store.set(STORAGE_KEYS.refresh, 'live-refresh')

    await expect(client.userAPI.changeEmail({ email: 'a@x.com', current_password: 'wrong' })).rejects.toBeDefined()

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

// The device that changes its own password or email stores its replacement token pair a
// moment after the server commits, and every older token is rejected from that instant.
// A request already in flight then 401s with the old access token; refreshing from there
// would present the old refresh token and sign out the device the change keeps signed in.
describe('a 401 that arrives while this device is switching to its new tokens', () => {
  const realAdapter = axios.defaults.adapter
  afterEach(() => { axios.defaults.adapter = realAdapter })

  const httpError = (status: number, config: any) => {
    const err: any = new Error(`Request failed with status code ${status}`)
    err.config = config
    err.response = { status, data: {}, statusText: '', headers: {}, config }
    return err
  }
  const ok = (config: any) => ({ data: { data: { id: 1 } }, status: 200, statusText: 'OK', headers: {}, config })

  const setup = async () => {
    const store = memStorage()
    let signedOut = false
    const client = createClient(store, { onAuthFailure: () => { signedOut = true } })
    await store.set(STORAGE_KEYS.access, 'old')
    await store.set(STORAGE_KEYS.refresh, 'old-refresh')
    await store.set(STORAGE_KEYS.user, '{"id":1}')
    return { store, client, wasSignedOut: () => signedOut }
  }

  it('retries with the token now in storage instead of refreshing', async () => {
    const { store, client, wasSignedOut } = await setup()
    let refreshes = 0
    axios.defaults.adapter = (async () => { refreshes += 1; throw httpError(401, {}) }) as any
    client.api.defaults.adapter = async (config: any) => {
      if (config.headers.Authorization === 'Bearer old') {
        await store.set(STORAGE_KEYS.access, 'new') // the new pair lands while this is in flight
        throw httpError(401, config)
      }
      return ok(config)
    }

    await expect(client.userAPI.me()).resolves.toBeDefined()

    expect(refreshes).toBe(0)
    expect(wasSignedOut()).toBe(false)
  })

  it('does not sign out when a refresh with the old token is refused as the new pair lands', async () => {
    const { store, client, wasSignedOut } = await setup()
    client.api.defaults.adapter = async (config: any) => {
      if (config.headers.Authorization === 'Bearer old') throw httpError(401, config)
      return ok(config)
    }
    axios.defaults.adapter = (async (config: any) => {
      await store.set(STORAGE_KEYS.access, 'new')
      await store.set(STORAGE_KEYS.refresh, 'new-refresh')
      throw httpError(401, config)
    }) as any

    await expect(client.userAPI.me()).resolves.toBeDefined()

    expect(wasSignedOut()).toBe(false)
    expect(await store.get(STORAGE_KEYS.access)).toBe('new')
    expect(await store.get(STORAGE_KEYS.refresh)).toBe('new-refresh')
  })

  it('still signs out when the session really was revoked and nothing newer exists', async () => {
    const { store, client, wasSignedOut } = await setup()
    client.api.defaults.adapter = async (config: any) => { throw httpError(401, config) }
    axios.defaults.adapter = (async (config: any) => { throw httpError(401, config) }) as any

    await expect(client.userAPI.me()).rejects.toBeDefined()

    expect(wasSignedOut()).toBe(true)
    expect(await store.get(STORAGE_KEYS.access)).toBeNull()
    expect(await store.get(STORAGE_KEYS.refresh)).toBeNull()
  })
})

describe('apiErrorMessage and uiMessage translate when they run', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })
  const bad502 = { response: { status: 502, data: '<html>Bad Gateway</html>' } }

  it('apiErrorMessage on a 502 follows the language switch, and en is unchanged after restoring', async () => {
    expect(apiErrorMessage(bad502, 'fallback')).toBe('The server is restarting or unreachable. Try again in a moment.')
    await i18n.changeLanguage('es')
    expect(apiErrorMessage(bad502, 'fallback')).toBe(es.errors.api.restarting)
    await i18n.changeLanguage('en')
    expect(apiErrorMessage(bad502, 'fallback')).toBe(en.errors.api.restarting)
  })

  it('a server-sent sentence passes through untranslated', async () => {
    await i18n.changeLanguage('es')
    expect(apiErrorMessage({ response: { status: 400, data: { error: 'Email already taken' } } }, 'x')).toBe('Email already taken')
  })

  it('uiMessage fills placeholders and re-translates the same stored message in es', async () => {
    const m = { key: 'food.favorites.addFailed', params: { name: 'Oats' } } as const
    expect(uiMessage(m)).toBe("Couldn't add Oats to Favorites.")
    await i18n.changeLanguage('es')
    expect(uiMessage(m)).toBe(es.food.favorites.addFailed.replace('{{name}}', 'Oats'))
  })

  it('uiMessage with a cause hands the failure to apiErrorMessage, with the key as its fallback', async () => {
    const m = { key: 'server.test.unreachable', cause: { response: { status: 418, data: {} } } } as const
    expect(uiMessage(m)).toBe("Couldn't reach the server.")
    await i18n.changeLanguage('es')
    expect(uiMessage(m)).toBe(es.server.test.unreachable)
    expect(uiMessage({ ...m, cause: bad502 })).toBe(es.errors.api.restarting)
  })
})

describe('apiErrorMessage — server codes', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })
  const body = (status: number, data: any) => ({ response: { status, data } })

  it('en: a known code renders the catalog text, not the server words', () => {
    expect(apiErrorMessage(body(409, { code: 'EMAIL_TAKEN', error: 'server words' }), 'x')).toBe(en.errors.api.codes.EMAIL_TAKEN)
  })

  it('es: a known code renders Spanish (a bare 500 is the observed bug)', async () => {
    await i18n.changeLanguage('es')
    expect(apiErrorMessage(body(500, { code: 'INTERNAL_ERROR', error: 'Something went wrong on the server.' }), 'x'))
      .toBe(es.errors.api.codes.INTERNAL_ERROR)
  })

  it('en: no code or an unregistered code returns the server sentence', () => {
    expect(apiErrorMessage(body(400, { error: 'Old server.' }), 'x')).toBe('Old server.')
    expect(apiErrorMessage(body(400, { code: 'BRAND_NEW', error: 'Newer server.' }), 'x')).toBe('Newer server.')
    expect(apiErrorMessage(body(400, { code: 'NOT_FOUND', error: 'Name is taken.' }), 'x')).toBe('Name is taken.')
  })

  it('en: no code and no sentence keeps the status handling', () => {
    expect(apiErrorMessage(body(404, {}), 'x')).toBe(en.errors.api.misconfigured)
    expect(apiErrorMessage(body(502, {}), 'x')).toBe(en.errors.api.restarting)
    expect(apiErrorMessage(body(500, {}), 'x')).toBe(en.errors.api.serverError)
    expect(apiErrorMessage(body(400, {}), 'fallback')).toBe('fallback')
  })

  it('es: VALIDATION_FAILED localizes each violation with Spanish field labels and joins them', async () => {
    await i18n.changeLanguage('es')
    const data = {
      error: 'English.',
      code: 'VALIDATION_FAILED',
      params: {
        violations: [
          { code: 'INVALID_EMAIL', params: { field: 'email' } },
          { code: 'TOO_SHORT', params: { field: 'password', min: 8 } },
          { code: 'BELOW_MINIMUM', params: { field: 'calories', min: 0 } },
        ],
      },
    }
    expect(apiErrorMessage(body(422, data), 'x')).toBe(
      [
        es.errors.api.codes.INVALID_EMAIL.replace('{{field}}', es.errors.api.fields.email),
        es.errors.api.codes.TOO_SHORT.replace('{{field}}', es.errors.api.fields.password).replace('{{min}}', '8'),
        es.errors.api.codes.BELOW_MINIMUM.replace('{{field}}', es.errors.api.fields.calories).replace('{{min}}', '0'),
      ].join(' '),
    )
  })

  it('es: one unresolvable violation falls back to the whole English sentence', async () => {
    await i18n.changeLanguage('es')
    const data = {
      error: 'English whole.',
      code: 'VALIDATION_FAILED',
      params: { violations: [{ code: 'REQUIRED', params: { field: 'email' } }, { code: 'NEW_RULE', params: { field: 'email' } }] },
    }
    expect(apiErrorMessage(body(422, data), 'x')).toBe('English whole.')
    data.params.violations = [{ code: 'REQUIRED', params: { field: 'email' } }, { code: 'REQUIRED', params: { field: 'not_a_field' } }]
    expect(apiErrorMessage(body(422, data), 'x')).toBe('English whole.')
  })

  it.each([
    ['FOOD_DATABASE_TIMEOUT', 503, undefined, undefined],
    ['EXERCISE_CATALOG_UNREACHABLE', 503, undefined, undefined],
    ['EXERCISE_SYNC_RUNNING', 409, undefined, undefined],
    ['EXERCISE_CATALOG_SHRANK', 409, undefined, undefined],
    ['PRODUCT_NOT_FOUND', 404, undefined, undefined],
    ['SEARCH_TERM_REQUIRED', 400, undefined, undefined],
    ['INVALID_WORKOUT_ID', 400, undefined, undefined],
    ['UNKNOWN_TIMEZONE', 400, { timezone: 'Mars/Base' }, 'Mars/Base'],
    ['FOOD_BRAND_TOO_LONG', 400, { max: 200 }, '200'],
  ])('es: %s renders Spanish', async (code, status, params, fill) => {
    await i18n.changeLanguage('es')
    const text = apiErrorMessage(body(status as number, { code, error: 'English.', params }), 'x')
    let want = (es.errors.api.codes as Record<string, string>)[code as string]
    if (params) want = want.replace('{{timezone}}', String((params as any).timezone ?? '')).replace('{{max}}', String((params as any).max ?? ''))
    expect(text).toBe(want)
    expect(text).not.toBe('English.')
    if (fill) expect(text).toContain(fill)
  })

  it('es: a bind failure on a nested field is labelled by its leaf', async () => {
    await i18n.changeLanguage('es')
    const data = { code: 'NOT_A_NUMBER', error: 'Exercises.sets.weight must be a number.', params: { field: 'exercises.sets.weight' } }
    expect(apiErrorMessage(body(400, data), 'x')).toBe('El campo Peso debe ser un número.')
  })

  it('en: a bind failure on a nested field names the leaf label', () => {
    const data = { code: 'NOT_A_NUMBER', error: 'Exercises.sets.weight must be a number.', params: { field: 'exercises.sets.weight' } }
    expect(apiErrorMessage(body(400, data), 'x')).toBe('Weight must be a number.')
  })

  it('es: INVALID_FIELDS (400) localizes its violations like VALIDATION_FAILED', async () => {
    await i18n.changeLanguage('es')
    const data = {
      code: 'INVALID_FIELDS',
      error: 'Weight unit must be one of: lbs, kg.',
      params: { violations: [{ code: 'NOT_AN_OPTION', params: { field: 'weight_unit', options: 'lbs, kg' } }] },
    }
    expect(apiErrorMessage(body(400, data), 'x')).toBe(
      es.errors.api.codes.NOT_AN_OPTION.replace('{{field}}', es.errors.api.fields.weight_unit).replace('{{options}}', 'lbs, kg'),
    )
  })

  it('en: VALIDATION_FAILED without violations shows the code text', () => {
    expect(apiErrorMessage(body(422, { code: 'VALIDATION_FAILED', error: 'e' }), 'x')).toBe(en.errors.api.codes.VALIDATION_FAILED)
  })

  it('en: a missing param falls back to the server sentence rather than showing {{max}}', () => {
    expect(apiErrorMessage(body(422, { code: 'TOO_LONG', error: 'Server sentence.', params: { field: 'name' } }), 'x')).toBe('Server sentence.')
  })

  it.each([
    ['non-string code', { code: 5, error: 'S.' }],
    ['lower-case code', { code: 'email_taken', error: 'S.' }],
    ['camelCase sibling key', { code: 'serverError', error: 'S.' }],
    ['dotted code', { code: 'EMAIL.TAKEN', error: 'S.' }],
    ['array params', { code: 'TOO_LONG', error: 'S.', params: [] }],
    ['object violations', { code: 'VALIDATION_FAILED', error: 'S.', params: { violations: {} } }],
    ['null violation', { code: 'VALIDATION_FAILED', error: 'S.', params: { violations: [null] } }],
    ['dotted field with an unknown leaf', { code: 'REQUIRED', error: 'S.', params: { field: 'a.b' } }],
    ['upper-case path', { code: 'NOT_A_NUMBER', error: 'S.', params: { field: 'A.b' } }],
    ['empty path segment', { code: 'NOT_A_NUMBER', error: 'S.', params: { field: 'a..b' } }],
  ])('malformed body (%s) never throws and falls back to the server sentence', (_n, data) => {
    expect(apiErrorMessage(body(422, data), 'x')).toBe('S.')
  })

  it('null params on a code that needs none still renders its text', () => {
    expect(apiErrorMessage(body(409, { code: 'EMAIL_TAKEN', error: 'S.', params: null }), 'x')).toBe(en.errors.api.codes.EMAIL_TAKEN)
  })

  describe('codes do not change which failures end a session', () => {
    const realAdapter = axios.defaults.adapter
    afterEach(() => { axios.defaults.adapter = realAdapter })

    const httpError = (status: number, config: any, data: any) => {
      const err: any = new Error(`Request failed with status code ${status}`)
      err.config = config
      err.response = { status, data, statusText: '', headers: {}, config }
      return err
    }

    const setup = (dataStatus: number, dataBody: any, refresh: (config: any) => Promise<any>) => {
      const store = memStorage()
      let signedOut = false
      const client = createClient(store, { onAuthFailure: () => { signedOut = true } })
      let refreshed = 0
      client.api.defaults.adapter = async (config: any) => { throw httpError(dataStatus, config, dataBody) }
      axios.defaults.adapter = (async (config: any) => { refreshed++; return refresh(config) }) as any
      return { client, store, wasSignedOut: () => signedOut, refreshCount: () => refreshed }
    }

    const signedIn = async (store: StorageAdapter) => {
      await store.set(STORAGE_KEYS.access, 'live-access')
      await store.set(STORAGE_KEYS.refresh, 'live-refresh')
    }

    it('a refresh answering 401 SESSION_EXPIRED still signs out', async () => {
      const { client, store, wasSignedOut } = setup(401, { code: 'SESSION_EXPIRED' }, async (config) => {
        throw httpError(401, config, { code: 'SESSION_EXPIRED', error: 'x' })
      })
      await signedIn(store)
      await expect(client.userAPI.me()).rejects.toBeDefined()
      expect(wasSignedOut()).toBe(true)
      expect(await store.get(STORAGE_KEYS.refresh)).toBeNull()
    })

    it('a refresh answering 503 DATABASE_BUSY keeps the session', async () => {
      const { client, store, wasSignedOut } = setup(401, {}, async (config) => {
        throw httpError(503, config, { code: 'DATABASE_BUSY', error: 'x' })
      })
      await signedIn(store)
      await expect(client.userAPI.me()).rejects.toBeDefined()
      expect(wasSignedOut()).toBe(false)
      expect(await store.get(STORAGE_KEYS.refresh)).toBe('live-refresh')
    })

    it('/me/password answering 401 WRONG_CURRENT_PASSWORD neither refreshes nor signs out', async () => {
      const { client, store, wasSignedOut, refreshCount } = setup(401, { code: 'WRONG_CURRENT_PASSWORD', error: 'x' }, async () => ({}))
      await signedIn(store)
      await expect(client.userAPI.changePassword({ current_password: 'a', new_password: 'bbbbbbbb' })).rejects.toBeDefined()
      expect(refreshCount()).toBe(0)
      expect(wasSignedOut()).toBe(false)
    })
  })
})

// The language exercise names come back in is one parameter added in one place: the
// request interceptor. No API method names it, so a screen cannot forget it.
describe('getLocale adds locale to the endpoints that answer in the reader language', () => {
  const localizedClient = (getLocale?: () => string | null | undefined | Promise<string | null | undefined>) => {
    const seen: Array<{ url?: string; params?: any }> = []
    const client = createClient(memStorage(), { getLocale })
    client.api.defaults.adapter = async (config: any) => {
      seen.push({ url: config.url, params: config.params })
      return { data: { data: [] }, status: 200, statusText: 'OK', headers: {}, config }
    }
    return { client, seen }
  }

  it('sends locale on a list call, merged with its own params, and on a get', async () => {
    const { client, seen } = localizedClient(() => 'es')
    await client.exerciseAPI.list({ q: 'sent', page: 2 })
    await client.workoutAPI.get(7)
    expect(seen[0].params).toMatchObject({ q: 'sent', page: 2, limit: 50, locale: 'es' })
    expect(seen[1].url).toBe('/workouts/7')
    expect(seen[1].params).toEqual({ locale: 'es' })
  })

  // Open Food Facts names a product in the language it was entered in; the server asks
  // for the reader's, so food search and barcode lookups carry it too.
  it('sends locale on food search and barcode lookup', async () => {
    const { client, seen } = localizedClient(() => 'es')
    await client.foodAPI.search('nutella', 5)
    await client.foodAPI.barcode('3017620406003')
    expect(seen[0].params).toEqual({ q: 'nutella', limit: 5, locale: 'es' })
    expect(seen[1].url).toBe('/food/barcode/3017620406003')
    expect(seen[1].params).toEqual({ locale: 'es' })
  })

  // A request nothing localizes keeps its URL: a proxy, a cache key or an e2e route that
  // matches on it must not start missing because a language was chosen.
  it('leaves every other endpoint alone', async () => {
    const { client, seen } = localizedClient(() => 'es')
    await client.weightAPI.delete(3)
    await client.foodAPI.list('2026-06-15')
    expect(seen[0].url).toBe('/weight/3')
    expect(seen[0].params).toBeUndefined()
    expect(seen[1].params).toEqual({ date: '2026-06-15' })
  })

  it.each([[''], [null], [undefined]])('adds nothing when the getter returns %p', async (value) => {
    const { client, seen } = localizedClient(() => value)
    await client.workoutAPI.get(7)
    expect(seen[0].params).toBeUndefined()
  })

  it('reads the getter on every request, awaiting an async one', async () => {
    let current = 'es'
    const { client, seen } = localizedClient(async () => current)
    await client.workoutAPI.get(1)
    current = 'fr'
    await client.workoutAPI.get(1)
    expect(seen.map((s) => s.params.locale)).toEqual(['es', 'fr'])
  })

  it('sends no locale when the client was created without a getter', async () => {
    const { client, seen } = localizedClient()
    await client.workoutAPI.get(1)
    expect(seen[0].params).toBeUndefined()
  })
})
