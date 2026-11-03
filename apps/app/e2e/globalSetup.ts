import { request } from '@playwright/test'
import { API_BASE } from './config'
import { recordCreatedUser } from './userRegistry'

// Blocks until the stack can actually serve the suite: the API answers, and the
// exercise library has finished its background seed (specs pick exercises, and an
// empty library fails them in ways that read like product bugs).
//
// It checks both by making its own account, which is the point. CI used to gate on
// logging in as demo@lyftr.local, so the whole suite silently depended on a seeded
// demo account — and now that DEMO_MODE is off by default, that gate would just hang
// for 90s and read like a flake. Nothing here assumes any account exists beforehand.
// The throwaway is recorded so globalTeardown deletes it with the rest.
const READY_TIMEOUT_MS = 120_000
const POLL_MS = 2_000

async function poll(label: string, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    if (await check().catch(() => false)) return
    if (Date.now() > deadline) {
      throw new Error(`[globalSetup] timed out after ${READY_TIMEOUT_MS / 1000}s waiting for ${label}`)
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ ignoreHTTPSErrors: true })
  try {
    await poll('the API to answer', async () => (await api.get(`${API_BASE}/info`)).ok())

    const email = `e2e-ready-${Date.now()}@lyftr.local`
    const res = await api.post(`${API_BASE}/auth/register`, {
      data: { email, password: 'password123' },
    })
    if (!res.ok()) {
      throw new Error(
        `[globalSetup] could not register a probe account (${res.status()}). ` +
        `If this server runs REGISTRATION=closed or first-user, the suite cannot run against it.`,
      )
    }
    const token = (await res.json()).data.token
    recordCreatedUser(token)

    await poll('the exercise library to seed', async () => {
      const list = await api.get(`${API_BASE}/exercises?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!list.ok()) return false
      return ((await list.json()).data ?? []).length > 0
    })
  } finally {
    await api.dispose()
  }
}
