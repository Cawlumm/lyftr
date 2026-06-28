import { request } from '@playwright/test'
import { existsSync, readFileSync, rmSync } from 'fs'
import { API_BASE } from './config'
import { REGISTRY_FILE } from './userRegistry'

// Deletes every account created during the run (recorded via recordCreatedUser).
// DELETE /me cascades all the user's data, so the DB is left exactly as it
// started. This is the authoritative cleanup — per-test/worker teardown is no
// longer relied on for it — and it's resilient: retries the transient
// SQLite-busy miss, and treats 401 (token already invalid) as "already gone".
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(REGISTRY_FILE)) return

  const tokens = [...new Set(
    readFileSync(REGISTRY_FILE, 'utf8').split('\n').map(t => t.trim()).filter(Boolean),
  )]
  if (tokens.length === 0) {
    rmSync(REGISTRY_FILE, { force: true })
    return
  }

  const api = await request.newContext({ ignoreHTTPSErrors: true })
  let deleted = 0
  for (const token of tokens) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await api
        .delete(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => null)
      // ok() = deleted; 401 = token invalid → already gone. Both are terminal.
      if (!res) break
      if (res.ok() || res.status() === 401) { if (res.ok()) deleted++; break }
      await new Promise(r => setTimeout(r, 200 * (attempt + 1))) // retry busy/5xx
    }
  }
  await api.dispose()
  rmSync(REGISTRY_FILE, { force: true })
  // eslint-disable-next-line no-console
  console.log(`[globalTeardown] swept ${deleted}/${tokens.length} e2e accounts`)
}
