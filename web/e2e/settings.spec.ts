import { test, expect } from '@playwright/test'

// Authenticated specs — these rely on the shared storage state from auth.setup.ts
// (no test.use override), since Settings is only reachable when logged in.

test('settings exposes an in-app, editable API server that persists and resets (#17)', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('Self-Hosted Instance')).toBeVisible()

  // #17: previously the API server was read-only here. The reusable Server Settings
  // editor is now available in-app, so a logged-in user can repoint the client.
  await page.getByRole('button', { name: /server settings/i }).click()
  const field = page.getByPlaceholder('Leave blank to use this site')
  await expect(field).toBeVisible()

  // Change to a different backend and save. 127.0.0.1:9 is a valid absolute URL that
  // refuses fast; warn-but-save persists the choice immediately regardless of the probe.
  await field.fill('http://127.0.0.1:9')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('server_url')))
    .toBe('http://127.0.0.1:9')
  // The editor's "Current:" line reflects the saved value.
  await expect(page.getByText(/Current:\s*http:\/\/127\.0\.0\.1:9/)).toBeVisible()

  // Reset to blank → reverse-proxy default. This is the in-app recovery path from a
  // bad URL that #17 was about (no sign-out required).
  await field.fill('')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('server_url')))
    .toBeNull()
  // The read-only summary row now shows the reverse-proxy default again.
  await expect(page.getByText('This site (reverse proxy)')).toBeVisible()
})
