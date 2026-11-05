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
// contrast failures were.
const SEED_WORKOUT = 'E2E Contrast Workout'
const SEED_PROGRAM = 'E2E Contrast Program'
const seeded = { workoutId: 0, programId: 0 }

test.describe('axe: colour contrast meets WCAG AA', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    const headers = { Authorization: `Bearer ${workerAuth.token}` }
    const post = async (path: string, data: unknown) => {
      const res = await request.post(`${API_BASE}${path}`, { headers, data })
      expect(res.ok(), `${path}: ${res.status()}`).toBeTruthy()
      return (await res.json()).data
    }

    // One exercise per muscle group, so every tint in the chip table that the catalogue
    // has an exercise for is on screen.
    const catalogue: { id: number; muscle_group: string }[] =
      (await (await request.get(`${API_BASE}/exercises?limit=500`, { headers })).json()).data ?? []
    const byMuscle = new Map<string, number>()
    for (const e of catalogue) if (e.muscle_group && !byMuscle.has(e.muscle_group)) byMuscle.set(e.muscle_group, e.id)
    const picks = [...byMuscle.values()].slice(0, 12)
    expect(picks.length).toBeGreaterThan(3)

    const programs: { id: number; name: string }[] = (await (await request.get(`${API_BASE}/programs`, { headers })).json()).data ?? []
    const workouts: { id: number; name: string }[] = (await (await request.get(`${API_BASE}/workouts?limit=100`, { headers })).json()).data ?? []
    const existingWorkout = workouts.find(w => w.name === SEED_WORKOUT)
    const existingProgram = programs.find(p => p.name === SEED_PROGRAM)
    if (existingWorkout && existingProgram) {
      seeded.workoutId = existingWorkout.id
      seeded.programId = existingProgram.id
      return
    }

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

    for (const [daysAgo, weight] of [[1, 182], [0, 180]]) {
      await post('/weight', { weight, logged_at: new Date(Date.now() - daysAgo * 86400000).toISOString() })
    }
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      await post('/food', { name: `E2E Contrast ${meal}`, meal, calories: 450, protein: 30, carbs: 50, fat: 12, logged_at: new Date().toISOString() })
    }
  })

  for (const theme of ['light', 'dark'] as const) {
    test.describe(theme, () => {
      test.beforeEach(async ({ page }) => {
        // Mid-fade text has partial opacity, which axe measures as low contrast.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
      })

      const paths = [
        '/', '/workouts', '/programs', '/nutrition', '/weight', '/settings',
        '/nutrition/log', '/workouts/exercises',
        () => `/workouts/${seeded.workoutId}`,
        () => `/programs/${seeded.programId}`,
      ]
      for (const path of paths) {
        const name = typeof path === 'string' ? path : path().replace(/\d+$/, ':id')
        test(name, async ({ page }) => {
          await page.goto(typeof path === 'string' ? path : path())
          await page.waitForLoadState('networkidle')
          expect(await violations(page, { only: ['color-contrast'] })).toEqual([])
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
