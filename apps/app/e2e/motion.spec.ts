import { test, expect } from './fixtures'
import { blackhole } from './faults'

// A black-holed API keeps the home screen on its skeletons indefinitely: a looping animation
// that never settles. Reanimated drives it from JS, not CSS, so document.getAnimations() would
// be empty either way; the honest check is whether any element's transform keeps changing.
const transforms = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('*'))
      .map(el => el.style.transform)
      .filter(Boolean)
      .join('|'),
  )

async function skeletonsWhileLoading(page: import('@playwright/test').Page) {
  await blackhole(page, '**/api/v1/**')
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await page.waitForTimeout(500)
}

test.describe('motion allowed', () => {
  test('a loading skeleton keeps animating', async ({ page }) => {
    await skeletonsWhileLoading(page)
    const first = await transforms(page)
    await page.waitForTimeout(400)
    expect(await transforms(page)).not.toBe(first)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no looping animation runs on a loading screen', async ({ page }) => {
    await skeletonsWhileLoading(page)
    const first = await transforms(page)
    await page.waitForTimeout(400)
    expect(await transforms(page)).toBe(first)
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0)
  })
})
