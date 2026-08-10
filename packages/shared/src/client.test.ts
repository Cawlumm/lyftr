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
