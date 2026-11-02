import { test, expect } from './fixtures'

// The harness's own proof of life: the image serves the export, /api reaches the backend
// through the nginx proxy, registration lands on Home, and nothing logs an error doing it.
//
// There is no <nav> landmark yet: the tab bar is React Navigation's default. The assertion
// takes whichever exists today (a navigation landmark or a tablist) and should be tightened
// to `getByRole('navigation')` when the custom tab bar lands.
// Tagged @mobile so the iPhone 14 project runs it too.
test('home loads after register with a nav bar and no console errors @mobile', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto('/')
  await expect(page).toHaveURL(url => new URL(url).pathname === '/')

  const nav = page.getByRole('navigation').or(page.getByRole('tablist')).first()
  await expect(nav).toBeVisible()
  await expect(page.getByText('Workouts', { exact: true }).first()).toBeVisible()

  // Settle past the first data fetches before judging the console.
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})
