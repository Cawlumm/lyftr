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
  const main = page.getByRole('main')
  await expect(main).toBeVisible()
  // Poll: on WebKit the box can still be settling right after the element becomes visible.
  await expect.poll(async () => (await main.boundingBox())?.width).toBe(390)
})

// Wheel and trackpad scrolling start at the element under the pointer, so the scroller must
// reach the window edges: a pointer in the empty gutter beside the centred column has to scroll
// the page, not nothing.
test('at 1280 scrolling over the side gutter scrolls the content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/settings')
  const main = page.getByRole('main')
  await expect(main).toBeVisible()
  const box = await main.boundingBox()
  if (!box) throw new Error('main has no box')
  expect(box.x).toBeGreaterThan(100)

  // The vertical scroller inside the column: the element whose scrollTop must move.
  const scrollTop = () => page.evaluate(() => {
    const m = document.querySelector('[role=main]')
    if (!m) return -1
    for (const el of m.querySelectorAll<HTMLElement>('*')) {
      if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== 'visible') return el.scrollTop
    }
    return -1
  })
  const before = await scrollTop()
  expect(before).toBeGreaterThanOrEqual(0)

  await page.mouse.move(box.x / 2, 300)
  await page.mouse.wheel(0, 400)
  await expect.poll(scrollTop).toBeGreaterThan(before)
})
