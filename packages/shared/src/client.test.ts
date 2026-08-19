import { createClient } from './client'
import { StorageAdapter } from './storage'

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
