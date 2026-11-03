import { type APIRequestContext } from '@playwright/test'

// Idempotent seeding helper. Deletes every item at `listUrl` matching `match`
// before the caller (re)creates its seed rows, so seeding produces exactly one
// set no matter how many times a `beforeAll` runs. That matters because a
// describe whose `beforeAll` seeds data runs once PER PROJECT (chromium +
// mobile), and at workers:1 both projects share one worker user — so without
// this, a tagged spec would double-seed and tests would hit duplicate rows.
//
// Targeted (exact match on the caller's own seed identifiers), not a broad
// "wipe everything" — so it can't clobber unrelated data. Serial deletes:
// SQLite is a single writer.
export async function cleanupSeed(
  request: APIRequestContext,
  token: string,
  listUrl: string,
  deleteBase: string,
  match: (item: any) => boolean,
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` }
  const res = await request.get(listUrl, { headers })
  const body = await res.json().catch(() => ({}))
  for (const item of (body.data ?? []).filter(match)) {
    await request.delete(`${deleteBase}/${item.id}`, { headers })
  }
}
