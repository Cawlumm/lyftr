import { test, expect, type Page } from '@playwright/test'
import { recordCreatedUser } from './userRegistry'
import { API_BASE } from './config'

// Ports web/e2e/auth.spec.ts one test to one test, in the same order. Where the Expo app
// differs from the Vite app the assertion is adapted, not dropped:
//  - fields are found by their label (the stack keeps /login mounted, hidden, under
//    /register, so a label alone would match both screens: `field` keeps the visible one);
//  - the error box is role=alert rather than the `.alert-error` class;
//  - the server-settings result reads "Connected to lyftr v..." (Vite said "Connected · lyftr");
//  - the field placeholder is the example URL, not "Leave blank to use this site";
//  - Settings rows are buttons that navigate, not links, so "Change" / "Change email" are
//    the Password and Email rows;
//  - one test is added: the demo button, once shown, really signs in on web (C06 � on native
//    it opens the hosted demo instead);
//  - the password-too-long rule reads "At most 72 characters (...)".

const emailField = (page: Page) => page.getByLabel('Email', { exact: true }).filter({ visible: true })
const passwordField = (page: Page) => page.getByLabel('Password', { exact: true }).filter({ visible: true })
const confirmField = (page: Page) => page.getByLabel('Confirm password', { exact: true }).filter({ visible: true })
const SERVER_URL = 'https://your-server.example.com'

// These run logged-out, so override the shared authenticated storage state.
test.use({ storageState: { cookies: [], origins: [] } })

// @mobile: critical smoke that auth + the app shell work at phone viewport.
test('registers a new user and lands on the dashboard', { tag: '@mobile' }, async ({ page }) => {
  const email = `e2e+${Date.now()}@lyftr.local`
  await page.goto('/register')
  await emailField(page).fill(email)
  await passwordField(page).fill('password123')
  await confirmField(page).fill('password123')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')

  // Record for globalTeardown to delete (cascades its data) — keeps register
  // test users from accumulating in the DB across runs.
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (token) recordCreatedUser(token)
})

test('wrong password shows an error and stays on the login page (no reload)', async ({ page }) => {
  // Regression guard: a 401 from /auth/login must surface "Invalid email or
  // password", not trigger a token-refresh redirect that reloads the page and
  // wipes the message.
  await page.goto('/login')
  // Any address works — the server answers "invalid email or password" whether the
  // account is missing or the password is wrong, and naming a seeded account here
  // implied the suite needed one.
  await emailField(page).fill('nobody@lyftr.local')
  await passwordField(page).fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('server settings rejects an invalid URL without persisting it', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByPlaceholder(SERVER_URL).fill('not a valid url')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(/include http:\/\/ or https:\/\//i)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('server_url'))).toBeNull()
})

test('server settings tests and connects to the default (reverse proxy)', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(/connected to lyftr/i)).toBeVisible()
})

test('server settings Save stays enabled when the field equals the current server (regression #18)', async ({ page }) => {
  // Regression for #18: before the #24 refactor the Save button was gated on a
  // separate `serverInput` state that only became non-empty once the *displayed*
  // value changed. So when the field already showed the current server URL and the
  // user re-typed that same value, `serverInput` stayed empty and Save was stuck
  // disabled. Seed a stored URL so the panel initializes with a non-empty value
  // matching what the user re-types, and assert Save never gets stuck.
  await page.addInitScript(() => localStorage.setItem('server_url', 'http://localhost:3000'))
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()

  const field = page.getByPlaceholder(SERVER_URL)
  await expect(field).toHaveValue('http://localhost:3000')

  const save = page.getByRole('button', { name: /test & save/i })
  await expect(save).toBeEnabled()

  // Re-typing the identical value must not disable Save (the original #18 repro).
  await field.fill('http://localhost:3000')
  await expect(save).toBeEnabled()
})

// NOTE: the scheme-less-host rejection case was removed — normalizeServerUrl's
// validation (scheme-less, whitespace, unparseable, path-stripping) is covered
// exhaustively in web/src/stores/server.test.ts. The "rejects an invalid URL"
// test above is kept as the single E2E proof that the panel surfaces a
// validation error to the user.

// Registers its own throwaway account rather than using the worker fixture: changing a
// password bumps that account's token_version, and the worker account is shared by every
// other spec in the run.
test('changes the password, then signs in with the new one', { tag: '@mobile' }, async ({ page }) => {
  const email = `e2e-pw+${Date.now()}@lyftr.local`
  const oldPassword = 'password123'
  const newPassword = 'newpassword456'

  await page.goto('/register')
  await emailField(page).fill(email)
  await passwordField(page).fill(oldPassword)
  await confirmField(page).fill(oldPassword)
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (token) recordCreatedUser(token)

  // Via the Settings link rather than a direct goto: the row is the only entry point in
  // the UI, so this is what proves the page is reachable at all.
  await page.goto('/settings')
  await page.getByRole('link', { name: /^password/i }).click()
  await expect(page).toHaveURL(/\/settings\/password$/)
  await page.getByLabel('Current password', { exact: true }).fill(oldPassword)
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: /update password/i }).click()

  await expect(page.getByRole('heading', { name: /password changed/i })).toBeVisible()
  await expect(page.getByText(/still signed in here/i)).toBeVisible()

  // The device that made the change keeps working — the client swapped in the pair the
  // server returned, so a normal authenticated read still succeeds.
  await page.goto('/workouts')
  await expect(page).toHaveURL(/\/workouts$/)

  // And the credential really moved: the old password no longer signs in, the new one does.
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await emailField(page).fill(email)
  await passwordField(page).fill(oldPassword)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await passwordField(page).fill(newPassword)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')
})

// The bug this guards: /me/password returns 401 for a wrong current password, and the
// shared client's refresh interceptor used to treat any 401 outside /auth/ as an expired
// session — refreshing, retrying, failing, and signing the user out over a typo.
test('a wrong current password shows an error without signing the user out', async ({ page }) => {
  const email = `e2e-pw-bad+${Date.now()}@lyftr.local`

  await page.goto('/register')
  await emailField(page).fill(email)
  await passwordField(page).fill('password123')
  await confirmField(page).fill('password123')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (token) recordCreatedUser(token)

  // Straight to the route — the same landing the /.well-known/change-password redirect
  // produces, so a deep link is covered as well as the in-app path used above.
  await page.goto('/settings/password')
  await page.getByLabel('Current password', { exact: true }).fill('not-my-password')
  await page.getByLabel('New password', { exact: true }).fill('newpassword456')
  await page.getByLabel('Confirm new password', { exact: true }).fill('newpassword456')
  await page.getByRole('button', { name: /update password/i }).click()

  await expect(page.getByRole('alert')).toContainText(/current password is incorrect/i)
  // Still signed in, still on the form — not bounced to /login.
  await expect(page).toHaveURL(/\/settings\/password$/)
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeTruthy()
})

test('changes the account email and signs in with the new address', async ({ page }) => {
  const ts = Date.now()
  const email = `e2e-email+${ts}@lyftr.local`
  const moved = `E2E-Moved+${ts}@lyftr.local`
  const password = 'password123'

  await page.goto('/register')
  await emailField(page).fill(email)
  await passwordField(page).fill(password)
  await confirmField(page).fill(password)
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (token) recordCreatedUser(token)

  await page.goto('/settings')
  await page.getByRole('link', { name: /^email/i }).click()
  await expect(page).toHaveURL(/\/settings\/email$/)
  await page.getByLabel('New email', { exact: true }).fill(moved)
  await page.getByLabel('Current password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /update email/i }).click()

  await expect(page.getByRole('heading', { name: /email changed/i })).toBeVisible()
  await expect(page.getByText(/other devices are signed out/i)).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByText(moved)).toBeVisible()

  // This device stays signed in: the client swapped in the pair the server returned. The
  // other devices are the ones signed out (covered by the backend tests).
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeTruthy()
  await page.goto('/workouts')
  await expect(page).toHaveURL(/\/workouts$/)

  // The address really moved: the old one no longer signs in, the new one does in any case.
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await emailField(page).fill(email)
  await passwordField(page).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await emailField(page).fill(moved.toLowerCase())
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')
})

// /me/email returns 401 for a wrong current password, the same shape as /me/password, and
// must not be mistaken for an expired session.
test('a wrong current password on change email shows an error without signing the user out', async ({ page }) => {
  const email = `e2e-email-bad+${Date.now()}@lyftr.local`

  await page.goto('/register')
  await emailField(page).fill(email)
  await passwordField(page).fill('password123')
  await confirmField(page).fill('password123')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (token) recordCreatedUser(token)

  await page.goto('/settings/email')
  await page.getByLabel('New email', { exact: true }).fill(`other+${Date.now()}@lyftr.local`)
  await page.getByLabel('Current password', { exact: true }).fill('not-my-password')
  await page.getByRole('button', { name: /update email/i }).click()

  await expect(page.getByRole('alert')).toContainText(/current password is incorrect/i)
  await expect(page).toHaveURL(/\/settings\/email$/)
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeTruthy()
})

// The W3C Change Password URL. Password managers open it to send a user to the form, and
// expect a redirect — served by nginx in production and by a vite middleware in dev, so
// this runs against either stack. Asserted without following, because a 200 here would
// mean the SPA fallback swallowed it and the manager would land on whatever React Router
// decides, not on the form.
//
// The exact relative Location is the assertion, not just the path: nginx defaults to
// absolute_redirect on, which would rebuild it from $scheme and — behind a TLS
// terminator, which is how both bundled configs run — hand a password manager an http://
// URL for a site it reached over https. Both configs turn it off. A regression there
// fails here rather than silently downgrading the redirect.
test('/.well-known/change-password redirects to the change-password form', async ({ page }) => {
  const res = await page.request.get('/.well-known/change-password', { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toBe('/settings/password')
})

// bcrypt cannot store more than 72 bytes, and a password manager's default generated
// password is longer than that. Before the limit was surfaced, the form let it through
// and the server answered 500 — the user was told to try again, which could never work.
test('a password too long for bcrypt is refused before it can be submitted', async ({ page }) => {
  const email = `e2e-pw-long+${Date.now()}@lyftr.local`

  await page.goto('/register')
  await emailField(page).fill(email)

  const tooLong = 'a'.repeat(100)
  await passwordField(page).fill(tooLong)
  await confirmField(page).fill(tooLong)

  // "At least 8 characters" under a 100-character password points the wrong way, so the
  // rule states the bound it actually failed.
  await expect(page.getByText(/at most 72 characters/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()

  // And the limit is bytes, so a passphrase that reads as short is still refused.
  const emoji = '\u{1F3CB}'.repeat(19)
  await passwordField(page).fill(emoji)
  await confirmField(page).fill(emoji)
  await expect(page.getByText(/at most 72 characters/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()
})

// The demo button used to be gated on import.meta.env.DEV, which is decided when the bundle
// is built rather than by the server it ends up talking to. It is now gated on the server's
// own demo_mode flag, and both directions matter enough to pin:
//
//   absent  — a self-hosted instance must never offer a sign-in as an account it never
//             seeded. That is the failure with a real victim, and this suite runs against
//             DEMO_MODE=off, so the assertion is against a genuine server rather than a mock.
//   present — the public demo runs a production build, so the old gate hid the button from
//             the one deployment that exists for it. Forced through a route intercept
//             because this stack has no demo account to sign into.
test('no demo sign-in button on a server without a demo account', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /try demo account/i })).toHaveCount(0)
})

test('demo sign-in button appears when the server reports demo mode', async ({ page }) => {
  await page.route('**/api/v1/info', async route => {
    const res = await route.fetch()
    const body = await res.json()
    body.data.demo_mode = true
    await route.fulfill({ response: res, json: body })
  })

  await page.goto('/login')
  await expect(page.getByRole('button', { name: /try demo account/i })).toBeVisible()
})

// Added for the Expo app (C06): on web the button signs in as the seeded demo account rather
// than opening the hosted demo. This stack has no demo account, so the test registers one
// under the demo credentials (and records it for teardown) behind the same demo_mode intercept.
test('demo sign-in button signs in on web', async ({ page, request }) => {
  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { email: 'demo@lyftr.local', password: 'password123' },
  })
  // Already there (a server that really seeds it) is fine: the credentials are the same.
  if (res.ok()) recordCreatedUser((await res.json()).data.token)

  await page.route('**/api/v1/info', async route => {
    const res = await route.fetch()
    const body = await res.json()
    body.data.demo_mode = true
    await route.fulfill({ response: res, json: body })
  })

  await page.goto('/login')
  await page.getByRole('button', { name: /try demo account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')
})
