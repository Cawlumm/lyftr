import { test, expect, type Page } from '@playwright/test'

// Authenticated specs — rely on the shared storage state from auth.setup.ts
// (no test.use override), since Settings is only reachable when logged in.
//
// #17: the in-app Settings "Self-Hosted Instance" panel now embeds the reusable
// ServerSettings editor (previously the API server was read-only here). These
// cover the happy paths (connect / change / reset) and the error + warn paths.

const server_url = () => localStorage.getItem('server_url')

// Opens /settings and expands the Server Settings editor. Returns the URL input.
async function openServerEditor(page: Page) {
  await page.goto('/settings')
  await expect(page.getByText('Self-Hosted Instance')).toBeVisible()
  await page.getByRole('button', { name: /server settings/i }).click()
  const field = page.getByPlaceholder('Leave blank to use this site')
  await expect(field).toBeVisible()
  return field
}

test.describe('Settings · Self-Hosted server editor (#17)', () => {
  // --- happy paths ---

  test('Test & Save on the default connects to the reverse-proxy backend', async ({ page }) => {
    const field = await openServerEditor(page)
    await expect(field).toHaveValue('') // default = same-origin reverse proxy
    await page.getByRole('button', { name: /test & save/i }).click()
    await expect(page.getByText(/connected · lyftr/i)).toBeVisible()
  })

  test('changing to a valid URL persists it', async ({ page }) => {
    const field = await openServerEditor(page)
    await field.fill('http://127.0.0.1:9') // valid absolute URL, refuses fast
    await page.getByRole('button', { name: /test & save/i }).click()
    await expect.poll(() => page.evaluate(server_url)).toBe('http://127.0.0.1:9')
    await expect(page.getByText(/Current:\s*http:\/\/127\.0\.0\.1:9/)).toBeVisible()
  })

  test('resetting to blank restores the reverse-proxy default (in-app recovery)', async ({ page }) => {
    // Start with a bad URL already saved — the exact stuck state #17 is about.
    await page.addInitScript(() => localStorage.setItem('server_url', 'http://127.0.0.1:9'))
    const field = await openServerEditor(page)
    await field.fill('')
    await page.getByRole('button', { name: /test & save/i }).click()
    await expect.poll(() => page.evaluate(server_url)).toBeNull()
    // The read-only summary row reflects the reset.
    await expect(page.getByText('This site (reverse proxy)')).toBeVisible()
  })

  // --- error paths (rejected, NOT persisted) ---

  test('a non-URL string is rejected and not saved', async ({ page }) => {
    const field = await openServerEditor(page)
    await field.fill('not a valid url')
    await page.getByRole('button', { name: /test & save/i }).click()
    await expect(page.getByText(/include http:\/\/ or https:\/\//i)).toBeVisible()
    expect(await page.evaluate(server_url)).toBeNull()
  })

  test('a scheme-less host is rejected (no scheme guessing) and not saved', async ({ page }) => {
    const field = await openServerEditor(page)
    await field.fill('127.0.0.1:9')
    await page.getByRole('button', { name: /test & save/i }).click()
    await expect(page.getByText(/include http:\/\/ or https:\/\//i)).toBeVisible()
    expect(await page.evaluate(server_url)).toBeNull()
  })

  // --- warn path (valid but unreachable → warn-but-save) ---

  test('a valid but unreachable URL is saved with a warning', async ({ page }) => {
    const field = await openServerEditor(page)
    await field.fill('http://127.0.0.1:9')
    await page.getByRole('button', { name: /test & save/i }).click()
    // Saved immediately (authoritative choice)...
    await expect.poll(() => page.evaluate(server_url)).toBe('http://127.0.0.1:9')
    // ...with an advisory warning that the probe couldn't reach it.
    await expect(page.getByText(/saved, but/i)).toBeVisible()
  })
})
