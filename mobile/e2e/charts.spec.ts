import type { Locator, Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'

// C22: the react-native-svg charts read on web through ChartTooltip. The pointer selects the
// nearest point, the chart takes focus and arrow keys step through its points, Escape dismisses
// without moving focus. Contracts: https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ and WCAG
// 1.4.13 (https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
// Two weights older than anything another spec logs, so Home always lands on the first.
const OLDEST = { lbs: 181.5, daysAgo: 6 }
const NEXT = { lbs: 182.5, daysAgo: 5 }
const WORKOUT = 'E2E Charts Push'
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]
const DAY = 86400000

test.beforeAll(async ({ request, workerAuth }) => {
  const headers = { Authorization: `Bearer ${workerAuth.token}` }
  const weights = (await (await request.get(`${API_BASE}/weight?limit=100`, { headers })).json()).data ?? []
  for (const w of [OLDEST, NEXT]) {
    if (weights.some((l: { weight: number }) => l.weight === w.lbs)) continue
    const res = await request.post(`${API_BASE}/weight`, {
      headers, data: { weight: w.lbs, logged_at: new Date(Date.now() - w.daysAgo * DAY).toISOString() },
    })
    expect(res.ok()).toBeTruthy()
  }
  const workouts = (await (await request.get(`${API_BASE}/workouts?limit=100`, { headers })).json()).data ?? []
  if (workouts.some((w: { name: string }) => w.name === WORKOUT)) return
  const exId = (await (await request.get(`${API_BASE}/exercises?limit=1`, { headers })).json()).data[0].id
  // Started now, so it is the volume chart's last bar whatever other specs logged.
  const res = await request.post(`${API_BASE}/workouts`, {
    headers,
    data: {
      name: WORKOUT, duration: 1800, started_at: new Date().toISOString(),
      exercises: [{ exercise_id: exId, order_index: 0, notes: '', rest_seconds: 90, sets: [
        { set_number: 1, reps: 8, weight: 135 }, { set_number: 2, reps: 8, weight: 135 },
      ] }],
    },
  })
  expect(res.ok()).toBeTruthy()
})

const weightChart = (page: Page) => page.getByRole('img', { name: 'Weight Progression' })
const tip = (page: Page) => page.getByRole('tooltip')
const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)
const enDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

async function openWeight(page: Page) {
  await page.goto('/weight')
  await expect(weightChart(page)).toBeVisible()
}

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return
  }
  throw new Error('Tab never reached the target')
}

test.describe('at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('hover shows the date and value; the pointer can move onto it', async ({ page }, testInfo) => {
    await openWeight(page)
    const chart = weightChart(page)
    await chart.scrollIntoViewIfNeeded()
    const box = (await chart.boundingBox())!
    // The left gutter is the y axis, so the nearest point to its edge is the oldest.
    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await expect(tip(page)).toContainText(`${OLDEST.lbs} lb`)
    await expect(tip(page)).toContainText(enDay(OLDEST.daysAgo))
    await testInfo.attach('weight-tooltip-1280.png', { body: await page.screenshot(), contentType: 'image/png' })

    const t = (await tip(page).boundingBox())!
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 5 })
    await page.waitForTimeout(400)
    await expect(tip(page)).toBeVisible()
    await page.mouse.move(box.x + box.width / 2, 40)
    await expect(tip(page)).toBeHidden()
  })

  test('focus shows the latest point, arrows move, Escape hides and keeps focus', async ({ page }) => {
    await openWeight(page)
    const chart = weightChart(page)
    await expect(chart).toHaveAccessibleDescription(/arrow keys/)
    await tabTo(page, chart)
    await expect(tip(page)).toBeVisible()
    await expect(chart).toHaveAccessibleDescription(/arrow keys .*lb/)

    await page.keyboard.press('Home')
    await expect(tip(page)).toContainText(`${OLDEST.lbs} lb`)
    await page.keyboard.press('ArrowRight')
    await expect(tip(page)).toContainText(`${NEXT.lbs} lb`)
    await page.keyboard.press('ArrowLeft')
    await expect(tip(page)).toContainText(`${OLDEST.lbs} lb`)
    // Clamped, not wrapped: the first point has nothing before it.
    await page.keyboard.press('ArrowLeft')
    await expect(tip(page)).toContainText(`${OLDEST.lbs} lb`)

    await page.keyboard.press('Escape')
    await expect(tip(page)).toBeHidden()
    expect(await isFocused(chart)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect(tip(page)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(tip(page)).toBeHidden()
  })

  test('screen readers get every value as a list', async ({ page }) => {
    await openWeight(page)
    const list = page.getByRole('list', { name: 'Weight Progression' })
    await expect(list.getByRole('listitem').filter({ hasText: `${OLDEST.lbs} lb` })).toHaveCount(1)
  })

  test('the dashboard volume chart reads its bars', async ({ page }, testInfo) => {
    await page.goto('/')
    const chart = page.getByRole('img', { name: 'Volume Trend' })
    await expect(chart).toBeVisible()
    await tabTo(page, chart)
    await page.keyboard.press('End')
    await expect(tip(page)).toContainText(WORKOUT)
    await expect(tip(page)).toContainText('2,160 lb')
    await testInfo.attach('volume-tooltip-1280.png', { body: await page.screenshot(), contentType: 'image/png' })
  })

  test('an open tooltip passes axe', async ({ page }) => {
    await openWeight(page)
    await tabTo(page, weightChart(page))
    await expect(tip(page)).toBeVisible()
    // Contrast is off for the same palette reason as a11y.spec.ts.
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast'])
      .analyze()
    expect(violations).toEqual([])
  })
})

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES', viewport: { width: 1280, height: 800 } })

  test('the tooltip writes a comma decimal and the path data stays canonical', async ({ page }) => {
    await page.goto('/weight')
    const chart = page.getByRole('img', { name: 'Progresión de peso' })
    await expect(chart).toBeVisible()
    await chart.focus()
    await page.keyboard.press('Home')
    await expect(tip(page)).toContainText('181,5')

    const paths = await chart.locator('xpath=..').locator('svg path').evaluateAll(els => els.map(e => e.getAttribute('d') ?? ''))
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) {
      // Coordinates keep their decimal point; a comma only ever separates two of them.
      expect(d).toMatch(/\d\.\d/)
      expect(d).not.toMatch(/\d,\d/)
    }
  })
})

for (const width of WIDTHS) {
  test(`an open chart tooltip causes no horizontal scroll at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await openWeight(page)
    await weightChart(page).focus()
    await page.keyboard.press('End')
    await expect(tip(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const t = (await tip(page).boundingBox())!
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.width).toBeLessThanOrEqual(width)
    if (width === 390 || width === 1920) {
      await testInfo.attach(`weight-tooltip-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  })
}
