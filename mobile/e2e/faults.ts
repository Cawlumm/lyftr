import type { Page } from '@playwright/test'

// Failure injection, named after the doctrine in CLAUDE.md ("Failing Requests") so a spec
// reads like the rule it pins.
//
// The rule: every request settles, and only the server may end a session. A timeout, a
// dropped connection or a 5xx means we never got an answer — keep the session, surface the
// error, let them retry. Only a 400/401/403 from the refresh means the server revoked it.
//
// These matter because the failures worth testing are the ones a stopped server cannot
// produce: it answers ECONNREFUSED instantly and hides the entire class. Gym wifi accepts
// the connection and says nothing; a proxy that accepts and never replies is the faithful
// model. `blackhole` is that model, and it is what turned #145 into a one-tap repro.

/** Accepts the connection and never answers — a dead spot in the gym's wifi. */
export const blackhole = (page: Page, pattern: string) =>
  page.route(pattern, () => { /* never fulfilled, never aborted */ })

/** The proxy is up, the backend is not — `docker compose up -d` mid-workout. */
export const gateway = (page: Page, pattern: string, status: 502 | 503 | 504 = 502) =>
  page.route(pattern, r => r.fulfill({ status, contentType: 'text/html', body: '<html><body>502 Bad Gateway</body></html>' }))

/** The backend answered, and it broke. Still not a verdict on the session. */
export const serverError = (page: Page, pattern: string) =>
  page.route(pattern, r => r.fulfill({ status: 500, json: { error: 'boom' } }))

/** The one answer that legitimately ends a session. */
export const revoked = (page: Page, pattern: string, status: 400 | 401 | 403 = 401) =>
  page.route(pattern, r => r.fulfill({ status, json: { error: 'token revoked' } }))

/** A well-formed response carrying a body the client cannot read. */
export const malformed = (page: Page, pattern: string, body: unknown) =>
  page.route(pattern, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }))

/**
 * Seed a value into localStorage before the app's first paint.
 *
 * addInitScript, not evaluate: hydration runs at module load, so a value written after
 * the page is up is read on the *next* navigation, not this one.
 */
export const corruptStorage = (page: Page, key: string, value: string) =>
  page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [key, value] as const)

/** Count matching requests without changing the outcome — for "one round-trip, not five". */
export function countRequests(page: Page, fragment: string): () => number {
  let n = 0
  page.on('request', req => { if (req.url().includes(fragment)) n += 1 })
  return () => n
}
