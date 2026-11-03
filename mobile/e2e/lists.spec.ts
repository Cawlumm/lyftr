import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'

// The list screens' wide layouts (C23). From lg on web the workouts and programs lists are a
// two-column card grid and the exercise browser a grid of up to three; below lg they are the
// phone's single column. Cards are real links, and their edit/delete actions are a kebab menu
// below sm and a hover row from sm that keyboard focus also reveals. The exercise browser
// keeps its search and filters in the URL.
const W = 'E2E Lists Workout'
const P = 'E2E Lists Program'
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]
const SCREENS = { workouts: '/workouts', programs: '/programs', exercises: '/workouts/exercises' } as const

let workoutIds: number[] = []

test.beforeAll(async ({ request, workerAuth }) => {
  const headers = { Authorization: `Bearer ${workerAuth.token}` }
  const existing = await (await request.get(`${API_BASE}/workouts?limit=100`, { headers })).json()
  workoutIds = (existing.data ?? []).filter((w: { name: string }) => w.name.startsWith(W)).map((w: { id: number }) => w.id)
  if (workoutIds.length < 3) {
    const exId = (await (await request.get(`${API_BASE}/exercises?limit=1`, { headers })).json()).data[0].id
    for (const n of [1, 2, 3]) {
      const res = await request.post(`${API_BASE}/workouts`, {
        headers,
        data: {
          name: `${W} ${n}`, duration: 2400,
          started_at: new Date(Date.now() - n * 86400000).toISOString(),
          exercises: [{ exercise_id: exId, order_index: 0, notes: '', sets: [{ set_number: 1, reps: 5, weight: 100 }] }],
        },
      })
      expect(res.ok()).toBeTruthy()
      workoutIds.push((await res.json()).data.id)
    }
  }
  const programs = await (await request.get(`${API_BASE}/programs?limit=100`, { headers })).json()
  const have = (programs.data ?? []).filter((p: { name: string }) => p.name.startsWith(P)).length
  for (let n = have + 1; n <= 2; n++) {
    const res = await request.post(`${API_BASE}/programs`, { headers, data: { name: `${P} ${n}`, notes: '', days: [] } })
    expect(res.ok()).toBeTruthy()
  }
})

async function open(page: Page, path: string, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto(path)
  await expect(page.getByRole('main').or(page.getByRole('heading', { level: 1 })).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

const boxOf = async (page: Page, name: string) => {
  const b = await page.getByRole('link', { name, exact: true }).first().boundingBox()
  if (!b) throw new Error(`no box for ${name}`)
  return b
}

for (const [screen, path] of Object.entries(SCREENS)) {
  for (const width of WIDTHS) {
    test(`${screen} does not scroll horizontally at ${width}px`, async ({ page }, testInfo) => {
      await open(page, path, width)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      if ([390, 768, 1280, 1920].includes(width)) {
        await testInfo.attach(`${screen}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
      }
    })
  }
}

test('at 1280 workouts and programs are two-column grids of links', async ({ page }) => {
  await open(page, '/workouts', 1280)
  await expect.poll(async () => Math.abs((await boxOf(page, `${W} 1`)).y - (await boxOf(page, `${W} 2`)).y)).toBeLessThanOrEqual(1)
  const [a, b, c] = [await boxOf(page, `${W} 1`), await boxOf(page, `${W} 2`), await boxOf(page, `${W} 3`)]
  expect(b.x).toBeGreaterThan(a.x + a.width - 1)
  expect(c.y).toBeGreaterThan(a.y + a.height)
  expect(Math.abs(c.x - a.x)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('link', { name: `${W} 1`, exact: true })).toHaveAttribute('href', `/workouts/${workoutIds[0]}`)

  await open(page, '/programs', 1280)
  await expect.poll(async () => Math.abs((await boxOf(page, `${P} 1`)).y - (await boxOf(page, `${P} 2`)).y)).toBeLessThanOrEqual(1)
  expect(await page.getByRole('link', { name: `${P} 1`, exact: true }).getAttribute('href')).toMatch(/^\/programs\/\d+$/)
})

test('at 390 the workout cards are one column with a kebab menu @mobile', async ({ page }) => {
  await open(page, '/workouts', 390, 844)
  const [a, b] = [await boxOf(page, `${W} 1`), await boxOf(page, `${W} 2`)]
  expect(b.y).toBeGreaterThan(a.y + a.height)
  expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: `Edit ${W} 1` })).toHaveCount(0)
  await page.getByRole('button', { name: `${W} 1 options` }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('a plain click on a card opens the workout through the router', async ({ page }) => {
  await open(page, '/workouts', 1280)
  await page.getByRole('link', { name: `${W} 1`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/workouts/${workoutIds[0]}$`))
  await page.goBack()
  await expect(page).toHaveURL(/\/workouts$/)
})

test('hover reveals the card actions, and so does keyboard focus', async ({ page }) => {
  await open(page, '/workouts', 1280)
  const edit = page.getByRole('button', { name: `Edit ${W} 1` })
  const row = edit.locator('..')
  const opacity = () => row.evaluate((el) => getComputedStyle(el).opacity)
  await page.mouse.move(5, 5)
  await expect.poll(opacity).toBe('0')

  await page.getByRole('link', { name: `${W} 1`, exact: true }).hover()
  await expect.poll(opacity).toBe('1')
  await page.mouse.move(5, 5)
  await expect.poll(opacity).toBe('0')

  await page.getByRole('link', { name: `${W} 1`, exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(edit).toBeFocused()
  await expect.poll(opacity).toBe('1')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: `Delete ${W} 1` })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the exercise browser is a three-column grid at 1280 and its rows are links', async ({ page }) => {
  await open(page, '/workouts/exercises', 1280)
  const links = page.locator('a[href^="/workouts/exercise/"]').locator('visible=true')
  await expect(links.first()).toBeVisible()
  const boxes = await Promise.all([0, 1, 2, 3].map(async (i) => (await links.nth(i).boundingBox())!))
  expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThanOrEqual(1)
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y + boxes[0].height)
})

test('the exercise detail is two columns at 1280', async ({ page }) => {
  await open(page, '/workouts/exercises', 1280)
  await page.locator('a[href^="/workouts/exercise/"]').locator('visible=true').first().click()
  await expect(page).toHaveURL(/\/workouts\/exercise\/\d+/)
  const label = page.getByText('Muscles Worked', { exact: true }).locator('visible=true')
  await expect(label).toBeVisible()
  // The muscles card is the left column, well under the content width a phone column would fill.
  const card = await label.locator('..').boundingBox()
  if (!card) throw new Error('no muscles card')
  expect(card.width).toBeLessThan(600)
  expect(card.x).toBeGreaterThan(240)
})

test.describe('exercise browser URL', () => {
  test('search and filters are written to the URL and survive a reload', async ({ page }) => {
    await open(page, '/workouts', 1280)
    await page.getByRole('link', { name: 'Browse exercises' }).click()
    await expect(page).toHaveURL(/\/workouts\/exercises/)
    const search = page.getByPlaceholder('Search exercises…').locator('visible=true')
    await search.fill('curl')
    await expect(page).toHaveURL(/[?&]q=curl/)

    await page.goto('/workouts/exercises?q=curl&muscle=biceps')
    await expect(page.getByRole('button', { name: 'Remove filter: Biceps' })).toBeVisible()
    await page.reload()
    await expect(page.getByPlaceholder('Search exercises…').locator('visible=true')).toHaveValue('curl')
    await expect(page.getByRole('button', { name: 'Remove filter: Biceps' })).toBeVisible()

    await page.getByRole('button', { name: 'Remove filter: Biceps' }).click()
    await expect(page).not.toHaveURL(/muscle=/)
    await expect(page).toHaveURL(/[?&]q=curl/)
  })

  test('filter changes replace the history entry, so Back returns to the workouts list', async ({ page }) => {
    await open(page, '/workouts', 1280)
    await page.getByRole('link', { name: 'Browse exercises' }).click()
    const search = page.getByPlaceholder('Search exercises…').locator('visible=true')
    await search.fill('row')
    await expect(page).toHaveURL(/[?&]q=row/)
    await search.fill('rows')
    await expect(page).toHaveURL(/[?&]q=rows/)
    await page.goBack()
    await expect(page).toHaveURL(/\/workouts$/)
  })

  test('Back from an exercise restores the search', async ({ page }) => {
    await open(page, '/workouts/exercises?q=curl', 1280)
    await page.locator('a[href^="/workouts/exercise/"]').locator('visible=true').first().click()
    await expect(page).toHaveURL(/\/workouts\/exercise\/\d+/)
    await page.goBack()
    await expect(page).toHaveURL(/[?&]q=curl/)
    await expect(page.getByPlaceholder('Search exercises…').locator('visible=true')).toHaveValue('curl')
  })
})

for (const [screen, path] of Object.entries(SCREENS)) {
  test(`axe: the wide ${screen} screen has no structural violations`, async ({ page }) => {
    await open(page, path, 1280)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
      .analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the card actions appear without a transition', async ({ page }) => {
    await open(page, '/workouts', 1280)
    const row = page.getByRole('button', { name: `Edit ${W} 1` }).locator('..')
    expect(await row.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
    await page.getByRole('link', { name: `${W} 1`, exact: true }).hover()
    expect(await row.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })
})
