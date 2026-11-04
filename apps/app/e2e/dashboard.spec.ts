import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { blackhole } from './faults'
import { WIDTH_GROUPS, sweepWidths } from './widths'

// The dashboard's wide layout (C21): at lg and up on web it is three stat tiles, last workout
// beside nutrition, muscle balance beside volume and weight, then the heatmap at full width.
// Below lg it is the phone's single column, unchanged. The account is seeded with one of
// everything so every card has content and every link exists.
const WORKOUT = 'E2E Dashboard Pull'

test.beforeAll(async ({ request, workerAuth }) => {
  const headers = { Authorization: `Bearer ${workerAuth.token}` }
  const list = await (await request.get(`${API_BASE}/workouts?limit=100`, { headers })).json()
  if ((list.data ?? []).some((w: { name: string }) => w.name === WORKOUT)) return

  const exId = (await (await request.get(`${API_BASE}/exercises?limit=1`, { headers })).json()).data[0].id
  for (const daysAgo of [1, 3]) {
    const res = await request.post(`${API_BASE}/workouts`, {
      headers,
      data: {
        name: WORKOUT, duration: 2700,
        started_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        exercises: [{ exercise_id: exId, order_index: 0, notes: '', rest_seconds: 90, sets: [
          { set_number: 1, reps: 8, weight: 135 }, { set_number: 2, reps: 8, weight: 145 },
        ] }],
      },
    })
    expect(res.ok()).toBeTruthy()
  }
  for (const daysAgo of [2, 1, 0]) {
    const res = await request.post(`${API_BASE}/weight`, {
      headers, data: { weight: 180 - daysAgo, logged_at: new Date(Date.now() - daysAgo * 86400000).toISOString() },
    })
    expect(res.ok()).toBeTruthy()
  }
  const food = await request.post(`${API_BASE}/food`, {
    headers, data: { name: 'E2E Dashboard Oats', meal: 'breakfast', calories: 600, protein: 40, carbs: 70, fat: 12, logged_at: new Date().toISOString() },
  })
  expect(food.ok()).toBeTruthy()
})

async function openDashboard(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.getByText(WORKOUT).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

const box = async (page: Page, text: string) => {
  const b = await page.getByText(text, { exact: true }).first().boundingBox()
  if (!b) throw new Error(`no box for ${text}`)
  return b
}

for (const widths of WIDTH_GROUPS) {
  test(`dashboard does not scroll horizontally at ${widths.join('/')}px`, async ({ page }, testInfo) => {
    await openDashboard(page, widths[0])
    await sweepWidths(page, testInfo, 'dashboard', widths)
    for (const width of widths.filter((w) => [390, 768, 1280, 1920].includes(w))) {
      // Tall enough to hold the whole screen: the page scrolls inside main, not the document.
      await page.setViewportSize({ width, height: width < 1024 ? 3200 : 1700 })
      await page.waitForTimeout(300)
      await testInfo.attach(`dashboard-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  })
}

test('at 1280 the cards sit in rows: stat tiles, workout beside nutrition, a full-width heatmap', async ({ page }) => {
  await openDashboard(page, 1280)
  const week = await box(page, 'This Week')
  const calories = await box(page, 'Calories')
  const protein = await box(page, 'Protein')
  expect(Math.abs(calories.y - week.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(protein.y - week.y)).toBeLessThanOrEqual(2)
  expect(calories.x).toBeGreaterThan(week.x)

  const last = await box(page, 'Last workout')
  const nutrition = await box(page, "Today's Nutrition")
  expect(Math.abs(nutrition.y - last.y)).toBeLessThan(12)
  expect(nutrition.x).toBeGreaterThan(last.x + 300)

  const muscle = await box(page, 'Muscle Balance')
  const volume = await box(page, 'Volume Trend')
  expect(Math.abs(volume.y - muscle.y)).toBeLessThan(12)
  // The muscle column is exactly one tile wide: the volume card beside it starts where the
  // second tile does. Both titles carry the same icon, so their offsets cancel.
  expect(Math.abs((volume.x - muscle.x) - (calories.x - week.x))).toBeLessThanOrEqual(2)

  const main = await page.getByRole('main').boundingBox()
  const heat = await page.getByText('Consistency', { exact: true }).first().boundingBox()
  if (!main || !heat) throw new Error('no box')
  expect(heat.y).toBeGreaterThan(volume.y)
  // Full width: the heatmap card starts at the column's left edge, like the muscle card.
  expect(Math.abs(heat.x - muscle.x)).toBeLessThanOrEqual(2)
  expect(heat.y).toBeGreaterThan(muscle.y)
})

test('at 390 the dashboard is one column with no stat tiles @mobile', async ({ page }) => {
  await openDashboard(page, 390, 844)
  await expect(page.getByText('Calories', { exact: true })).toHaveCount(0)
  const volume = await box(page, 'Volume Trend')
  const heat = await box(page, 'Consistency')
  expect(heat.y).toBeGreaterThan(volume.y + 50)
  expect(Math.abs(heat.x - volume.x)).toBeLessThanOrEqual(2)
})

test('keyboard: Tab reaches every card link on the wide layout', async ({ page }) => {
  await openDashboard(page, 1280)
  // No Settings avatar here: beside the sidebar its user menu is the one way in (P18).
  const want = ['Start', WORKOUT, 'All', 'View', 'Log weight']
  const seen = new Set<string>()
  // Generous bound: the heatmap's 84 day cells are each a stop before the last cards.
  for (let i = 0; i < 160 && want.some(w => !seen.has(w)); i++) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? `${el.getAttribute('aria-label') ?? ''}|${el.innerText ?? ''}` : ''
    })
    for (const w of want) if (label.includes(w)) seen.add(w)
  }
  expect([...seen].sort()).toEqual([...want].sort())
})

test('axe: the wide dashboard has no structural violations', async ({ page }) => {
  await openDashboard(page, 1280)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
    .analyze()
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('button', { name: /user menu/ })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'Settings' })).toHaveCount(0)
})

// Cumulative Layout Shift over the load, skeleton to content. Shifts right after input do
// not count (that is the metric's own rule), and nothing is typed here anyway.
for (const width of [390, 1280]) {
  test(`loading the dashboard shifts the layout by less than 0.1 at ${width}px`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) w.__cls += e.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await openDashboard(page, width)
    await page.waitForTimeout(1000)
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls).toBeLessThan(0.1)
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  // Reanimated drives the skeleton shimmer from JS, so the check is whether any transform
  // keeps changing (as in motion.spec.ts), here on the wide skeleton.
  test('the wide loading skeleton holds still', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await blackhole(page, '**/api/v1/**')
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await page.waitForTimeout(500)
    const transforms = () => page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('*')).map(el => el.style.transform).filter(Boolean).join('|'))
    const first = await transforms()
    await page.waitForTimeout(400)
    expect(await transforms()).toBe(first)
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0)
  })
})
