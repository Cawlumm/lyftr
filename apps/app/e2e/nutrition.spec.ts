import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { blackhole } from './faults'
import { WIDTH_GROUPS, sweepWidths } from './widths'

// The nutrition diary and log flow on wide web (C25). From lg the day's food is on the left
// and its totals stick in a column on the right, with the Diary/Trends switch and the date
// navigator in one toolbar; below lg it is the phone's single column. The log flow keeps a
// centred narrow column. The barcode scanner (expo-camera) loads only when Scan is pressed.
const PREFIX = 'E2E Nutrition'
const COUNT = 14
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString()

test.beforeAll(async ({ request, workerAuth }) => {
  const headers = { Authorization: `Bearer ${workerAuth.token}` }
  const logs = await (await request.get(`${API_BASE}/food?date=${today}`, { headers })).json()
  const have = (logs.data ?? []).filter((l: { name: string }) => l.name.startsWith(PREFIX)).length
  const meals = ['breakfast', 'lunch', 'dinner', 'snacks']
  for (let n = have + 1; n <= COUNT; n++) {
    const res = await request.post(`${API_BASE}/food`, {
      headers,
      data: {
        name: `${PREFIX} ${pad(n)}`, meal: meals[n % 4], calories: 150, protein: 10, carbs: 15, fat: 5,
        logged_at: todayNoon, logged_on: today,
      },
    })
    expect(res.ok()).toBeTruthy()
  }
})

async function open(page: Page, path: string, width: number, height = 800) {
  await page.setViewportSize({ width, height })
  await page.goto(path)
  await expect(page.getByRole('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

// The list orders by meal, so the first row on screen is whichever seeded entry is breakfast.
const firstRow = (page: Page) => page.locator('a[href^="/nutrition/"]').locator('visible=true').first()
const calories = (page: Page) => page.getByText('Calories', { exact: true }).locator('visible=true')
const pickDate = (page: Page) => page.getByLabel('Pick date').locator('visible=true')
const noHorizontalScroll = (page: Page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const [screen, path] of [['diary', '/nutrition'], ['log', '/nutrition/log']] as const) {
  for (const widths of WIDTH_GROUPS) {
    test(`${screen} does not scroll horizontally at ${widths.join('/')}px`, async ({ page }, testInfo) => {
      await open(page, path, widths[0])
      await sweepWidths(page, testInfo, screen, widths, { shoot: [390, 1280, 1920], height: 800 })
    })
  }
}

test('trends does not scroll horizontally at any width', async ({ page }) => {
  for (const width of WIDTHS) {
    await open(page, '/nutrition', width)
    await page.getByRole('button', { name: 'Trends', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Macro History' })).toBeVisible()
    expect(await noHorizontalScroll(page), `at ${width}`).toBe(true)
  }
})

test('at 1280 the food list is on the left and the totals beside it', async ({ page }) => {
  await open(page, '/nutrition', 1280)
  const first = (await firstRow(page).boundingBox())!
  const totals = (await calories(page).boundingBox())!
  expect(totals.x).toBeGreaterThan(first.x + first.width)
  expect(Math.abs(totals.y - first.y)).toBeLessThan(120)
  // The date navigator sits in the toolbar above the totals column, not above the list.
  const pill = (await pickDate(page).boundingBox())!
  expect(pill.x).toBeGreaterThan(first.x + first.width - 1)
  expect(pill.y).toBeLessThan(totals.y)
})

test('at 1280 the totals stay in view while the list scrolls', async ({ page }) => {
  await open(page, '/nutrition', 1280, 700)
  await firstRow(page).hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(async () => (await firstRow(page).boundingBox())?.y ?? -1).toBeLessThan(0)
  const totals = (await calories(page).boundingBox())!
  expect(totals.y).toBeGreaterThan(0)
  expect(totals.y).toBeLessThan(120)
})

test('at 390 the totals sit above the list in one column @mobile', async ({ page }) => {
  await open(page, '/nutrition', 390, 844)
  const totals = (await calories(page).boundingBox())!
  const first = (await firstRow(page).boundingBox())!
  expect(first.y).toBeGreaterThan(totals.y)
  expect(Math.abs(first.x - totals.x)).toBeLessThan(40)
})

test('the log flow is a centred narrow column at 1280', async ({ page }) => {
  await open(page, '/nutrition/log', 1280)
  const main = (await page.getByRole('main').boundingBox())!
  expect(main.width).toBeLessThanOrEqual(576)
  const sidebar = 240
  const centre = sidebar + (1280 - sidebar) / 2
  expect(Math.abs(main.x + main.width / 2 - centre)).toBeLessThanOrEqual(2)
})

test('food rows are links to the entry', async ({ page }) => {
  await open(page, '/nutrition', 1280)
  await expect(firstRow(page)).toHaveAttribute('href', /^\/nutrition\/\d+$/)
  const name = await firstRow(page).getAttribute('aria-label')
  await page.getByRole('button', { name: `${name} options` }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await firstRow(page).click()
  await expect(page).toHaveURL(/\/nutrition\/\d+$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/nutrition$/)
})

test('inputs carry inputmode, enterkeyhint and autocomplete', async ({ page }) => {
  await open(page, '/nutrition', 1280)
  const daySearch = page.getByPlaceholder("Search this day's food…").locator('visible=true')
  await expect(daySearch).toHaveAttribute('enterkeyhint', 'search')
  await expect(daySearch).toHaveAttribute('autocomplete', 'off')

  await open(page, '/nutrition/log', 1280)
  const search = page.getByPlaceholder('Search food…').locator('visible=true')
  await expect(search).toHaveAttribute('enterkeyhint', 'search')
  await expect(search).toHaveAttribute('autocomplete', 'off')

  await page.getByText(new RegExp(`^${PREFIX} \\d+$`)).locator('visible=true').first().click()
  const amount = page.getByRole('textbox', { name: 'Servings' }).locator('visible=true')
  await expect(amount).toHaveAttribute('inputmode', 'decimal')
  await expect(amount).toHaveAttribute('enterkeyhint', 'done')
  await expect(amount).toHaveAttribute('autocomplete', 'off')
})

test('keyboard: change the day with the arrows and the date field, then open an entry', async ({ page }) => {
  await open(page, '/nutrition', 1280)
  const prev = page.getByRole('button', { name: 'Previous day' })
  const next = page.getByRole('button', { name: 'Next day' })
  const pill = pickDate(page).locator('..')
  await expect(next).toHaveAttribute('aria-disabled', 'true')
  await expect(pill).toContainText('Today')

  await prev.focus()
  await page.keyboard.press('Enter')
  await expect(pill).toContainText('Yesterday')

  // Tab reaches the date field, and its ring is drawn on the pill around it. Chromium's date
  // field takes a Tab stop per segment (month, day, year) and one for its picker button.
  await page.keyboard.press('Tab')
  await expect(pickDate(page)).toBeFocused()
  await expect.poll(() => pill.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')

  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab')
  await expect(next).toBeFocused()
  await page.keyboard.press(' ')
  await expect(pill).toContainText('Today')
  await expect(next).toHaveAttribute('aria-disabled', 'true')

  // The date field itself: arrow keys step the focused segment (month, in en-US).
  await pickDate(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(pill).not.toContainText('Today')
  await expect(pill).not.toContainText('Yesterday')
})

test('keyboard: Tab from the date navigator reaches the search and the first entry', async ({ page }) => {
  await open(page, '/nutrition', 1280)
  await page.getByRole('button', { name: 'Previous day' }).focus()
  // The date field's month, day, year and picker button, then past Next day, disabled today.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
  await expect(page.getByPlaceholder("Search this day's food…").locator('visible=true')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('href', /^\/nutrition\/\d+$/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/nutrition\/\d+$/)
})

test('the scanner is fetched only when Scan is pressed', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (r) => { if (/\/BarcodeScanner-[^/]+\.js$/.test(r.url())) chunks.push(r.url()) })
  await open(page, '/nutrition/log', 1280)
  expect(chunks).toEqual([])
  await page.getByRole('button', { name: 'Scan barcode' }).click()
  await expect.poll(() => chunks.length).toBe(1)
  await page.getByRole('button', { name: 'Close scanner' }).click()
  await expect(page.getByPlaceholder('Search food…').locator('visible=true')).toBeVisible()
})

for (const [name, path, width, trends] of [
  ['diary 1280', '/nutrition', 1280, false],
  ['trends 1280', '/nutrition', 1280, true],
  ['diary 390', '/nutrition', 390, false],
  ['log 1280', '/nutrition/log', 1280, false],
] as const) {
  test(`axe: the ${name} screen has no structural violations`, async ({ page }) => {
    await open(page, path, width)
    if (trends) {
      await page.getByRole('button', { name: 'Trends', exact: true }).click()
      await expect(page.getByRole('img', { name: 'Macro History' })).toBeVisible()
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
      .analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

for (const width of [390, 1280]) {
  test(`loading the diary shifts the layout by less than 0.1 at ${width}px`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) w.__cls += e.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await open(page, '/nutrition', width)
    await expect(firstRow(page)).toBeVisible()
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1)
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the wide loading skeleton holds still', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await blackhole(page, '**/api/v1/food**')
    await page.goto('/nutrition')
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
