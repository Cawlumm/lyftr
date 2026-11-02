import { test, expect } from './fixtures'

// Ports web/e2e/settings.spec.ts. Authenticated spec: the worker's storage state comes
// from fixtures.ts, since Settings is only reachable when logged in.
//
// #17: Settings embeds an editable API server field. Differences from the Vite page:
//  - the Expo Server group shows the field and its Test & save button directly, with no
//    "Server settings" disclosure (that disclosure is the sign-in screens' ServerRow);
//  - the group is titled "Server" (not "Self-Hosted Instance"), its field is labelled
//    "Server URL", and the blank state reads "Default backend" (not "This site (reverse proxy)").
// The editor's own validation / connect behaviour is covered by auth.spec.ts on the
// sign-in screen, so it is not re-tested here.

test('Settings exposes an editable API server: change persists and resets in-app (#17)', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('Server', { exact: true })).toBeVisible()

  const field = page.getByRole('textbox', { name: 'Server URL' })
  await expect(field).toBeVisible()

  // A change made in-app takes effect (127.0.0.1:9 is a valid absolute URL).
  await field.fill('http://127.0.0.1:9')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('server_url'))).toBe('http://127.0.0.1:9')

  // Reset to blank recovers from a bad URL without signing out — the point of #17.
  await field.fill('')
  await page.getByRole('button', { name: /test & save/i }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('server_url'))).toBeNull()
  await expect(page.getByText('Default backend')).toBeVisible()
})
