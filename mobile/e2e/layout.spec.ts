import { test, expect } from './fixtures'

const WIDTHS = [320, 390, 768, 1024, 1280, 1920]

// The widths the layout primitives are accountable to: nothing may scroll sideways at any of
// them, and from 768 up the main column is centred at its max width rather than stretched.
for (const width of WIDTHS) {
  test(`home does not scroll horizontally at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

    if (width === 390 || width === 1280) {
      await testInfo.attach(`home-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })
}

test('at 1280 the main column is centred at its max width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const main = page.getByRole('main')
  await expect(main).toBeVisible()
  const box = await main.boundingBox()
  if (!box) throw new Error('main has no box')
  // Screen's default column is max-w-3xl (48rem = 768px on web).
  expect(box.width).toBeLessThanOrEqual(768)
  expect(box.width).toBeGreaterThan(600)
  expect(Math.abs(box.x - (1280 - box.x - box.width))).toBeLessThanOrEqual(1)
})

test('at 390 the main column fills the viewport @mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const box = await page.getByRole('main').boundingBox()
  expect(box?.width).toBe(390)
})
