import { test, expect } from '@playwright/test'

// Authenticated spec — relies on the shared storage state from auth.setup.ts
// (no test.use override), since Settings is only reachable when logged in.
//
// #17: the in-app Settings "Self-Hosted Instance" panel now embeds the reusable
// ServerSettings editor (previously the API server was read-only here). This is
// the ONE thing #17 added — the integration. The editor's own validation /
// connect / warn-but-save behaviour is location-independent and already covered
// by auth.spec.ts on the sign-in screen, so we don't re-test it here.

test('Settings exposes an editable API server: change persists and resets in-app (#17)', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('Self-Hosted Instance')).toBeVisible()

  // The editor is wired into the page (it used to be read-only text).
  await page.getByRole('button', { name: /server settings/i }).click()
  const field = page.getByPlaceholder('Leave blank to use this site')
  await expect(field).toBeVisible()

  // A change made in-app takes effect (127.0.0.1:9 is a valid absolute URL).
  await field.fill('http://127.0.0.1:9')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('server_url'))).toBe('http://127.0.0.1:9')

  // Reset to blank recovers from a bad URL without signing out — the point of #17.
  await field.fill('')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('server_url'))).toBeNull()
  await expect(page.getByText('This site (reverse proxy)')).toBeVisible()
})
