import { test, expect } from './fixtures'

// The harness's own proof of life: the image serves the export, /api reaches the backend
// through the nginx proxy, registration lands on Home, and nothing logs an error doing it.
//
// The nav landmark is the sidebar on a desktop window and the bottom tab bar on a phone
// (shell.spec.ts covers both). Tagged @mobile so the iPhone 14 project runs it too.
test('home loads after register with the nav and no console errors @mobile', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto('/')
  await expect(page).toHaveURL(url => new URL(url).pathname === '/')

  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('navigation').getByText('Workouts', { exact: true })).toBeVisible()

  // Settle past the first data fetches before judging the console.
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

// The auth screens sit outside Screen, so AuthScaffold carries its own main landmark.
test.describe('auth screens', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  for (const route of ['/login', '/register']) {
    test(`${route} has a main landmark and a single h1`, async ({ page }) => {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    })
  }
})

// One h1 per screen: the document outline a screen reader (and axe) navigates by.
for (const route of ['/', '/workouts', '/programs', '/nutrition', '/weight', '/settings']) {
  test(`${route} has a single visible h1 @mobile`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
}
