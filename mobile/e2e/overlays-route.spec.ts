import { test, expect } from './fixtures'

// The dev route is gated by a localStorage flag and is removed with C20/C22. Every other spec
// sets the flag, so this one proves the flag is what lets the page render and that without it
// the route sends a signed-in user home.
const FLAG = 'lyftr:dev-stories'

test('/dev-overlays redirects home without the flag and renders with it', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(flag => localStorage.removeItem(flag), FLAG)

  await page.goto('/dev-overlays')
  await expect(page).not.toHaveURL(/dev-overlays/)
  await expect(page.getByRole('button', { name: 'Options', exact: true })).toHaveCount(0)

  await page.evaluate(flag => localStorage.setItem(flag, '1'), FLAG)
  await page.goto('/dev-overlays')
  await expect(page).toHaveURL(/dev-overlays/)
  await expect(page.getByRole('button', { name: 'Options', exact: true })).toBeVisible()
})
