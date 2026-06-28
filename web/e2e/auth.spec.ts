import { test, expect } from '@playwright/test'

// These run logged-out, so override the shared authenticated storage state.
test.use({ storageState: { cookies: [], origins: [] } })

// @mobile: critical smoke that auth + the app shell work at phone viewport.
test('registers a new user and lands on the dashboard', { tag: '@mobile' }, async ({ page }) => {
  const email = `e2e+${Date.now()}@lyftr.local`
  await page.goto('/register')
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.locator('#password').fill('password123')
  await page.locator('#password-confirm').fill('password123')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(url => new URL(url).pathname === '/')
})

test('wrong password shows an error and stays on the login page (no reload)', async ({ page }) => {
  // Regression guard: a 401 from /auth/login must surface "Invalid email or
  // password", not trigger a token-refresh redirect that reloads the page and
  // wipes the message.
  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill('demo@lyftr.local')
  await page.locator('#password').fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.locator('.alert-error')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('server settings rejects an invalid URL without persisting it', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByPlaceholder('Leave blank to use this site').fill('not a valid url')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(/include http:\/\/ or https:\/\//i)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('server_url'))).toBeNull()
})

test('server settings tests and connects to the default (reverse proxy)', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(/connected · lyftr/i)).toBeVisible()
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

  const field = page.getByPlaceholder('Leave blank to use this site')
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
