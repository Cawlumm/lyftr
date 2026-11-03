import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { blackhole } from './faults'

// The weight screens on wide web (C26). From lg the figures and trend are on the left and the
// log form and history in a column on the right; from xl the hero and the tiles share a row.
// History rows are real links to /weight/:id. The detail is a centred max-w-2xl column whose
// delete confirm is a dialog. Below lg it is the phone's single column.
const NOTE = 'E2E Weight layout'
// More than one page (20), so the wide history has to page in on scroll.
const COUNT = 26
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]
const SIDEBAR = 240

const pad = (n: number) => String(n).padStart(2, '0')
const dayAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, noon: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString() }
}

test.beforeAll(async ({ request, workerAuth }) => {
  const headers = { Authorization: `Bearer ${workerAuth.token}` }
  const logs = await (await request.get(`${API_BASE}/weight?limit=1000`, { headers })).json()
  const have = (logs.data ?? []).filter((l: { notes?: string }) => l.notes === NOTE).length
  for (let n = have; n < COUNT; n++) {
    const { day, noon } = dayAgo(n + 1)
    const res = await request.post(`${API_BASE}/weight`, {
      headers,
      data: { weight: 180 - (n % 5), notes: NOTE, logged_at: noon, logged_on: day },
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

const rows = (page: Page) => page.locator('a[href^="/weight/"]').locator('visible=true')
const trend = (page: Page) => page.getByText('Trend', { exact: true }).locator('visible=true')
const logButton = (page: Page) => page.getByRole('button', { name: 'Log Weight' })
const hero = (page: Page) => page.getByText('Current Weight', { exact: true }).locator('visible=true')
const avg = (page: Page) => page.getByText('Avg', { exact: true }).locator('visible=true')
const noHorizontalScroll = (page: Page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth)
const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!

async function firstEntryPath(page: Page) {
  await open(page, '/weight', 1280)
  return (await rows(page).first().getAttribute('href'))!
}

for (const width of WIDTHS) {
  test(`list and detail do not scroll horizontally at ${width}px`, async ({ page }, testInfo) => {
    const detail = await firstEntryPath(page)
    for (const [screen, path] of [['list', '/weight'], ['detail', detail]] as const) {
      await open(page, path, width)
      expect(await noHorizontalScroll(page), `${screen} at ${width}`).toBe(true)
      if ([390, 1280, 1920].includes(width)) {
        await testInfo.attach(`${screen}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
      }
    }
  })
}

test('every history row is a link to its entry', async ({ page }) => {
  await open(page, '/weight', 1280)
  await expect(rows(page).first()).toBeVisible()
  const hrefs = await rows(page).evaluateAll((els) => els.map((el) => el.getAttribute('href')))
  expect(hrefs.length).toBeGreaterThanOrEqual(20)
  for (const href of hrefs) expect(href).toMatch(/^\/weight\/\d+$/)
  // Each link is named by what it opens, not by the card's text run together.
  await expect(rows(page).first()).toHaveAttribute('aria-label', /^\d+ lb, \w{3} \d{1,2}, \d{4}$/)
})

for (const width of [1024, 1280, 1920]) {
  test(`at ${width} the figures sit above the trend and the history is to its right`, async ({ page }) => {
    await open(page, '/weight', width, width === 1920 ? 1080 : 800)
    const chart = await box(trend(page))
    const h = await box(hero(page))
    const tiles = await box(avg(page))
    const first = await box(rows(page).first())
    const log = await box(logButton(page))
    expect(tiles.y).toBeLessThan(chart.y)
    expect(Math.abs(h.x - chart.x)).toBeLessThan(40)
    expect(first.x).toBeGreaterThan(chart.x + 300)
    // The log form heads the right column, above the history.
    expect(Math.abs(log.x - first.x)).toBeLessThan(40)
    expect(log.y).toBeLessThan(first.y)
    if (width >= 1280) {
      // From xl the hero and the tiles share a row.
      expect(Math.abs(h.y - tiles.y)).toBeLessThan(8)
      expect(tiles.x).toBeGreaterThan(h.x + 150)
    } else {
      expect(h.y).toBeLessThan(tiles.y - 40)
    }
  })
}

test('at 1280 the figures stay in view while the history scrolls', async ({ page }) => {
  await open(page, '/weight', 1280, 900)
  await rows(page).first().hover()
  await page.mouse.wheel(0, 900)
  await expect.poll(async () => (await rows(page).first().boundingBox())?.y ?? 0).toBeLessThan(0)
  const chart = await box(trend(page))
  expect(chart.y).toBeGreaterThan(0)
  expect(chart.y).toBeLessThan(900)
})

test('at 1280 the history pages in as it scrolls', async ({ page }) => {
  await open(page, '/weight', 1280, 900)
  await expect(rows(page)).toHaveCount(20)
  await rows(page).first().hover()
  await expect.poll(async () => {
    await page.mouse.wheel(0, 2000)
    return rows(page).count()
  }).toBeGreaterThan(20)
})

test('a window tall enough for the first page still pages in the rest', async ({ page }) => {
  await open(page, '/weight', 1280, 2800)
  await expect.poll(() => rows(page).count()).toBeGreaterThan(20)
})

test('at 390 it is one column: log, figures, trend, then history @mobile', async ({ page }) => {
  await open(page, '/weight', 390, 844)
  const log = await box(logButton(page))
  const h = await box(hero(page))
  const chart = await box(trend(page))
  expect(log.y).toBeLessThan(h.y)
  expect(h.y).toBeLessThan(chart.y)
  expect(Math.abs(h.x - chart.x)).toBeLessThan(40)
})

test('the detail is a centred column no wider than max-w-2xl at 1280', async ({ page }) => {
  const detail = await firstEntryPath(page)
  await open(page, detail, 1280)
  const card = await box(page.getByText('Weight Entry', { exact: true }).locator('..').locator('..').locator('..'))
  expect(card.width).toBeLessThanOrEqual(672)
  const centre = SIDEBAR + (1280 - SIDEBAR) / 2
  expect(Math.abs(card.x + card.width / 2 - centre)).toBeLessThanOrEqual(2)
})

test('a row opens its entry, and Back returns to the list', async ({ page }) => {
  await open(page, '/weight', 1280)
  const href = (await rows(page).first().getAttribute('href'))!
  await rows(page).first().click()
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  await expect(page.getByText('Weight Entry', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/weight$/)
})

test('keyboard: from Log Weight, Tab reaches the first entry, its actions, then the next entry', async ({ page }) => {
  await open(page, '/weight', 1280)
  await logButton(page).focus()
  await page.keyboard.press('Tab')
  const first = rows(page).first()
  await expect(first).toBeFocused()
  const label = (await first.getAttribute('aria-label'))!
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: `Edit ${label}` })).toBeFocused()
  await page.keyboard.press('Tab')
  const del = page.getByRole('button', { name: `Delete ${label}` })
  await expect(del).toBeFocused()
  // Delete confirms in a dialog; Escape closes it and gives focus back to the button.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(del).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/weight\/\d+$/)
})

test('detail: Delete opens the confirm as a dialog, and Escape closes it', async ({ page }) => {
  const detail = await firstEntryPath(page)
  await open(page, detail, 1280)
  await page.getByRole('button', { name: 'Delete entry' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Wide web shows it as a dialog centred in the window, not a sheet pinned to the bottom edge.
  const title = await box(dialog.getByText('Delete Entry?', { exact: true }))
  expect(Math.abs(title.x + title.width / 2 - 640)).toBeLessThanOrEqual(4)
  expect(title.y).toBeLessThan(500)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`${detail}$`))
})

test('rows open the edit form from their Edit action', async ({ page }) => {
  await open(page, '/weight', 1280)
  const label = (await rows(page).first().getAttribute('aria-label'))!
  await rows(page).first().hover()
  await page.getByRole('button', { name: `Edit ${label}` }).click()
  await expect(page).toHaveURL(/\/weight\/\d+\?edit=1$/)
  await expect(page.getByText('Edit Entry', { exact: true })).toBeVisible()
})

for (const [name, width, dialog] of [
  ['list 1280', 1280, false],
  ['list 390', 390, false],
  ['detail 1280', 1280, false],
  ['detail delete dialog 1280', 1280, true],
] as const) {
  test(`axe: the ${name} screen has no structural violations`, async ({ page }) => {
    const path = name.startsWith('detail') ? await firstEntryPath(page) : '/weight'
    await open(page, path, width)
    if (dialog) {
      await page.getByRole('button', { name: 'Delete entry' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
      .analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

for (const width of [390, 1280, 1920]) {
  test(`loading the list shifts the layout by less than 0.1 at ${width}px`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) w.__cls += e.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await open(page, '/weight', width, width === 1920 ? 1080 : 800)
    await expect(rows(page).first()).toBeAttached()
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1)
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the wide loading skeleton holds still', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await blackhole(page, '**/api/v1/weight**')
    await page.goto('/weight')
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
