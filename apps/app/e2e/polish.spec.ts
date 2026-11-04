import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'

// The route walk behind the polish checklist in docs/TESTING.md. Every route, at the four
// widths the layouts are designed for, in both themes: nothing scrolls sideways, nothing
// logs an error, and each screen carries exactly one h1. The screenshots are for a person
// to look at (no pixel baselines), so they are attached to the report rather than compared.
const WIDTHS = [390, 768, 1280, 1920]
const THEMES = ['light', 'dark'] as const

// Widths change by resizing the same page, not by reloading: that is also how a desktop
// window is used, and it keeps the walk to two loads per route.
async function walk(page: Page, testInfo: TestInfo, name: string, path: string) {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  for (const theme of THEMES) {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
    await page.setViewportSize({ width: WIDTHS[0], height: 900 })
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      // Only visible headings count: the stack keeps earlier screens mounted under display:none.
      await expect(page.getByRole('heading', { level: 1 }), `${name} ${width} ${theme}: one h1`).toHaveCount(1)
      await expect.poll(() => overflow(page), `${name} ${width} ${theme}: no sideways overflow`).toEqual([])
      await testInfo.attach(`${name}-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  }
  expect(errors, `${name}: console errors`).toEqual([])
}

// The document must not scroll sideways. That alone misses the RN-web failure, though: a
// ScrollView clips with overflow-x hidden, so content wider than it is cut off rather than
// scrollable. So no visible text may sit past the window's edges either, unless it is inside
// a scroller that moves sideways on purpose (chip rows, day strips). Text, not boxes, because
// decorative shapes (the auth hero's blobs) overhang the edge by design.
const overflow = (page: Page) => page.evaluate(() => {
  const out: string[] = []
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth) out.push(`document ${doc.scrollWidth}>${doc.clientWidth}`)
  const sideways = (el: Element | null): boolean => {
    for (; el && el !== doc; el = el.parentElement) {
      const x = getComputedStyle(el).overflowX
      if (x === 'auto' || x === 'scroll') return true
    }
    return false
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || !n.textContent?.trim() || !el.checkVisibility()) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || (r.right <= innerWidth + 1 && r.left >= -1)) continue
    if (!sideways(el)) out.push(`"${n.textContent.trim().slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`)
  }
  return out
})

test.describe('Route walk, signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const [name, path] of [['login', '/login'], ['register', '/register']] as const) {
    test(`${name}`, async ({ page }, testInfo) => {
      await walk(page, testInfo, name, path)
    })
  }
})

test.describe('Route walk, signed in', () => {
  const ids = { exercise: 0, workout: 0, program: 0, food: 0, weight: 0 }

  test.beforeAll(async ({ request, workerAuth }) => {
    const headers = { Authorization: `Bearer ${workerAuth.token}` }
    const data = async (r: Promise<import('@playwright/test').APIResponse>) => {
      const res = await r
      const body = await res.json()
      if (!body.data) throw new Error(`seed failed: ${JSON.stringify(body)}`)
      return body.data
    }
    ids.exercise = (await data(request.get(`${API}/exercises?limit=1`, { headers })))[0].id
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const sets = [{ set_number: 1, reps: 8, weight: 135 }]
    ids.workout = (await data(request.post(`${API}/workouts`, {
      headers,
      data: { name: 'Polish walk workout', duration: 2700, started_at: now.toISOString(), exercises: [{ exercise_id: ids.exercise, order_index: 0, notes: '', sets }] },
    }))).id
    ids.program = (await data(request.post(`${API}/programs`, {
      headers,
      data: {
        name: 'Polish walk program', notes: '',
        days: [{ order_index: 0, is_rest_day: false, name: '', exercises: [{ exercise_id: ids.exercise, notes: '', rest_seconds: 90, sets: [{ set_number: 1, target_reps: 5, target_weight: 100 }] }] }],
      },
    }))).id
    ids.food = (await data(request.post(`${API}/food`, {
      headers,
      data: { name: 'Polish walk oats', meal: 'breakfast', calories: 300, protein: 10, carbs: 50, fat: 6, logged_at: now.toISOString(), logged_on: today },
    }))).id
    ids.weight = (await data(request.post(`${API}/weight`, {
      headers,
      data: { weight: 175, notes: '', logged_at: now.toISOString() },
    }))).id
  })

  const routes: [string, () => string][] = [
    ['home', () => '/'],
    ['workouts', () => '/workouts'],
    ['workout-new', () => '/workouts/new'],
    ['workout-start', () => '/workouts/start'],
    ['workout-detail', () => `/workouts/${ids.workout}`],
    ['workout-edit', () => `/workouts/${ids.workout}/edit`],
    ['exercises', () => '/workouts/exercises'],
    ['exercise-detail', () => `/workouts/exercise/${ids.exercise}`],
    ['programs', () => '/programs'],
    ['program-new', () => '/programs/new'],
    ['program-detail', () => `/programs/${ids.program}`],
    ['program-edit', () => `/programs/${ids.program}/edit`],
    ['program-exercise', () => `/programs/exercise/${ids.exercise}`],
    ['nutrition', () => '/nutrition'],
    ['nutrition-log', () => '/nutrition/log'],
    ['nutrition-entry', () => `/nutrition/${ids.food}`],
    ['weight', () => '/weight'],
    ['weight-entry', () => `/weight/${ids.weight}`],
    ['settings', () => '/settings'],
    ['settings-name', () => '/settings/name'],
    ['settings-email', () => '/settings/email'],
    ['settings-password', () => '/settings/password'],
    ['not-found', () => '/no-such-page'],
  ]

  for (const [name, path] of routes) {
    test(`${name}`, async ({ page }, testInfo) => {
      await walk(page, testInfo, name, path())
    })
  }

  // The active screen only exists while a session runs, so it is reached the way a person does.
  test('workout-active', async ({ page }, testInfo) => {
    await page.goto('/workouts/start')
    await page.getByRole('button', { name: /quick start/i }).click()
    await page.waitForURL(/\/workouts\/active/)
    await walk(page, testInfo, 'workout-active', '/workouts/active')
  })
})
