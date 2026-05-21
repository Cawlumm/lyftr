import { test, expect } from '@playwright/test'

// These run logged-out, so override the shared authenticated storage state.
test.use({ storageState: { cookies: [], origins: [] } })

test('registers a new user and lands on the dashboard', async ({ page }) => {
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
  await expect(page.getByText(/enter a full url/i)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('server_url'))).toBeNull()
})

test('server settings tests and connects to the default (reverse proxy)', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(/connected · lyftr/i)).toBeVisible()
})

test('server settings normalizes a scheme-less host using the page protocol', async ({ page }) => {
  // A bare host must adopt the page's own scheme (https on an HTTPS page, http on
  // an HTTP one) — coercing to a fixed scheme would risk mixed-content blocking.
  // The dev server runs over HTTPS and the Docker E2E over HTTP, so derive it.
  await page.goto('/login')
  const expected = `${new URL(page.url()).protocol}//127.0.0.1:9`
  await page.getByRole('button', { name: /server settings/i }).click()
  await page.getByPlaceholder('Leave blank to use this site').fill('127.0.0.1:9')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect(page.getByText(`Current: ${expected}`)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('server_url'))).toBe(expected)
})
