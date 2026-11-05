import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import { API_BASE } from './config'

// Ports web/e2e/a11y.spec.ts test for test. Icon-only controls had no accessible name: a
// screen reader announced "button", and nothing else. The fix is one attribute per control,
// which is the kind of change that rots silently.
//
// So the names are asserted by ROLE here rather than by CSS or position. That is what
// makes them load-bearing: delete an accessibilityLabel and this fails.
//
// The axe scans at the bottom are new here (the Vite suite had none): @axe-core/playwright is
// approved for this migration, and they hold the structure rules (names, roles, landmarks,
// ARIA validity) at zero violations on the screens that carry the app.
//
// The paths are the Expo app's own: /workout/start and /food/log are the old URLs, which
// redirect to /workouts/start and /nutrition/log, so those are asserted directly.
test.describe('Icon-only controls have accessible names', () => {
  const BACK_ON = ['/workouts/new', '/programs/new', '/nutrition/log', '/workouts/start']

  for (const path of BACK_ON) {
    test(`${path} names its back button`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible()
    })
  }

  // The destructive ones matter most: a control that removes a set or an exercise is the
  // worst thing to announce as an unnamed "button".
  test('the workout form names its destructive controls', async ({ page }) => {
    await page.goto('/workouts/new')

    await page.getByRole('button', { name: /add exercise/i }).click()
    await page.getByPlaceholder(/search exercises/i).fill('bench press')
    await page.getByText(/bench press/i).first().click()

    // The Expo card names the exercise it removes ("Remove Bench Press with Chains"), which
    // is more specific than the Vite page's generic "Remove exercise".
    await expect(page.getByRole('button', { name: /^remove .*bench press/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove set' }).first()).toBeVisible()
  })
})

// WCAG 2.x A/AA and 2.2 AA. The structural scans leave colour contrast to its own block at the
// bottom, so a palette regression and a missing name never hide behind each other.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function violations(page: import('@playwright/test').Page, rules: { disable?: string[]; only?: string[] } = {}) {
  await page.waitForLoadState('networkidle')
  let axe = new AxeBuilder({ page }).withTags(WCAG)
  if (rules.disable) axe = axe.disableRules(rules.disable)
  if (rules.only) axe = axe.withRules(rules.only)
  const { violations } = await axe.analyze()
  return violations.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)
}

test.describe('axe: no structural violations', () => {
  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    for (const path of ['/login', '/register']) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path)
        expect(await violations(page, { disable: ['color-contrast'] })).toEqual([])
      })
    }
  })

  for (const path of ['/', '/workouts', '/settings', '/settings/password']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path)
      expect(await violations(page, { disable: ['color-contrast'] })).toEqual([])
    })
  }
})

// WCAG 3.1.1: a screen reader picks its pronunciation from <html lang>, which index.html ships
// as "en". A Spanish UI must say so, or every label is read with English rules.
test.describe('the page language follows the app language', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('es', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lyftr_language', 'es'))
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  })
})

// Colour contrast in both themes, on every top-level screen and the login screen. The web lifts
// muted text, solid brand fills and a few literal inks to AA (useDocumentChrome, theme.ts);
// native keeps the shared palette. The scanned account is populated: an empty one renders no
// muscle chips, no TODAY / UP NEXT tag, no weight delta and no meal pills, which is where the
// contrast failures were. Each scan first waits for the seeded thing it exists to measure, so it
// cannot pass by scanning an empty screen.
const SEED_WORKOUT = 'E2E Contrast Workout'
const SEED_PROGRAM = 'E2E Contrast Program'
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks']
const seeded = { workoutId: 0, programId: 0, created: [] as string[] }

test.describe('axe: colour contrast meets WCAG AA', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    const headers = { Authorization: `Bearer ${workerAuth.token}` }
    const post = async (path: string, data: unknown) => {
      const res = await request.post(`${API_BASE}${path}`, { headers, data })
      expect(res.ok(), `${path}: ${res.status()}`).toBeTruthy()
      const row = (await res.json()).data
      seeded.created.push(`${path}/${row.id}`)
      return row
    }

    // One exercise per muscle group: the first twelve groups the catalogue has.
    const catalogue: { id: number; muscle_group: string }[] =
      (await (await request.get(`${API_BASE}/exercises?limit=500`, { headers })).json()).data ?? []
    const byMuscle = new Map<string, number>()
    for (const e of catalogue) if (e.muscle_group && !byMuscle.has(e.muscle_group)) byMuscle.set(e.muscle_group, e.id)
    const picks = [...byMuscle.values()].slice(0, 12)
    expect(picks.length).toBeGreaterThan(3)

    seeded.workoutId = (await post('/workouts', {
      name: SEED_WORKOUT, duration: 3000,
      started_at: new Date(Date.now() - 86400000).toISOString(),
      exercises: picks.map((exercise_id, i) => ({
        exercise_id, order_index: i, notes: '', rest_seconds: 90,
        sets: [{ set_number: 1, reps: 8, weight: 135 }, { set_number: 2, reps: 8, weight: 145 }],
      })),
    })).id

    // Seven working days: whichever one is current, TODAY and UP NEXT render.
    seeded.programId = (await post('/programs', {
      name: SEED_PROGRAM, notes: '',
      days: Array.from({ length: 7 }, (_, i) => ({
        order_index: i, is_rest_day: false, name: `Day ${i + 1}`,
        exercises: picks.slice(0, 4).map(exercise_id => ({
          exercise_id, notes: '', rest_seconds: 90, sets: [{ set_number: 1, target_reps: 8, target_weight: 100 }],
        })),
      })),
    })).id

    // 182 then 180: a loss, so the delta renders green.
    for (const [daysAgo, weight] of [[1, 182], [0, 180]]) {
      await post('/weight', { weight, logged_at: new Date(Date.now() - daysAgo * 86400000).toISOString() })
    }
    for (const meal of MEALS) {
      await post('/food', { name: `E2E Contrast ${meal}`, meal, calories: 450, protein: 30, carbs: 50, fat: 12, logged_at: new Date().toISOString() })
    }
  })

  // The worker account is deleted by globalTeardown; this keeps the rows from leaking into
  // the specs that share it meanwhile.
  test.afterAll(async ({ request, workerAuth }) => {
    const headers = { Authorization: `Bearer ${workerAuth.token}` }
    for (const path of seeded.created.splice(0)) await request.delete(`${API_BASE}${path}`, { headers })
  })

  type Screen = { path: () => string; ready: (page: Page) => Promise<void>; then?: (page: Page) => Promise<void> }
  const screens: Record<string, Screen> = {
    '/': {
      path: () => '/',
      ready: async page => {
        await expect(page.getByText(/^Up next/i).first()).toBeVisible()
        await expect(page.getByText(/7d · ↓/).first()).toBeVisible()
      },
    },
    '/workouts': { path: () => '/workouts', ready: async page => { await expect(page.getByText(SEED_WORKOUT).first()).toBeVisible() } },
    '/programs': { path: () => '/programs', ready: async page => { await expect(page.getByText(SEED_PROGRAM).first()).toBeVisible() } },
    '/nutrition': {
      path: () => '/nutrition',
      ready: async page => { for (const m of MEALS) await expect(page.getByText(`E2E Contrast ${m}`).first()).toBeVisible() },
    },
    '/weight': { path: () => '/weight', ready: async page => { await expect(page.getByText(/lost over/).first()).toBeVisible() } },
    '/settings': { path: () => '/settings', ready: async page => { await expect(page.locator('body')).toBeVisible() } },
    // A recent food opens the detail panel: the calorie hero, macro grid and macro percentages.
    '/nutrition/log': {
      path: () => '/nutrition/log',
      ready: async page => {
        await page.getByText('E2E Contrast breakfast').first().click()
        await expect(page.getByText('Protein', { exact: true }).first()).toBeVisible()
      },
    },
    '/workouts/exercises': { path: () => '/workouts/exercises', ready: async page => { await expect(page.getByText(/^chest$/i).first()).toBeVisible() } },
    '/workouts/:id': {
      path: () => `/workouts/${seeded.workoutId}`,
      ready: async page => { await expect(page.getByText(SEED_WORKOUT).first()).toBeVisible() },
    },
    '/programs/:id': {
      path: () => `/programs/${seeded.programId}`,
      ready: async page => { await expect(page.getByText('TODAY', { exact: true }).first()).toBeVisible() },
      // Picking another day makes TODAY the unselected chip, a different pairing.
      then: async page => {
        await page.getByText('Day 2', { exact: true }).first().click()
        await expect(page.getByText('TODAY', { exact: true }).first()).toBeVisible()
      },
    },
  }

  for (const theme of ['light', 'dark'] as const) {
    test.describe(theme, () => {
      test.beforeEach(async ({ page }) => {
        // Mid-fade text has partial opacity, which axe measures as low contrast.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
      })

      for (const [name, screen] of Object.entries(screens)) {
        test(name, async ({ page }) => {
          await page.goto(screen.path())
          await screen.ready(page)
          expect(await violations(page, { only: ['color-contrast'] })).toEqual([])
          if (screen.then) {
            await screen.then(page)
            expect(await violations(page, { only: ['color-contrast'] })).toEqual([])
          }
        })
      }

      test.describe('signed out', () => {
        test.use({ storageState: { cookies: [], origins: [] } })
        test('/login', async ({ page }) => {
          await page.goto('/login')
          expect(await violations(page, { only: ['color-contrast'] })).toEqual([])
        })
      })
    })
  }
})
