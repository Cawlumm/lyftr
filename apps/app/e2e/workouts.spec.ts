import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// Ports web/e2e/workouts.spec.ts one test to one test. Differences from the Vite app:
//  - the active workout lives at /workouts/active; one added test pins that the old
//    /workout/active URL still lands there (C09);
//  - queries are by role and accessible name instead of `.card` and `input[placeholder=..]`:
//    workout cards are links whose Edit and Delete buttons appear on hover or focus at this
//    project's desktop width, and the set inputs are labelled "Set reps" and "Set weight";
//  - the gym overlay is a modal dialog named "Workout" (C30), so every gym query is scoped to
//    it instead of taking nth(1) of the page's inputs, and the focus test asserts that Tab
//    never leaves the dialog rather than looking for an inert `main`;
//  - the two list tests that only asserted `if` a volume existed now seed a logged set, so
//    they can fail.
const E2E_WORKOUT_NAME = 'Test Workout E2E'
const SEED_WORKOUT_NAME = 'Seeded Test Workout'
const SEED_SEARCH_WORKOUT_NAME = 'ZZZ E2E SearchTarget Workout'
const PROG_PROGRESSION_NAME = 'E2E AutoProgression Routine'
const LAYOUT_KEY = 'lyftr_workout_layout'
const SESSION_KEY = 'lyftr_active_session'

let workoutId: number
let authToken: string
let exerciseId: number

const ours = (w: { name: string }) =>
  w.name === SEED_WORKOUT_NAME || w.name === SEED_SEARCH_WORKOUT_NAME || w.name === E2E_WORKOUT_NAME

test.describe('Workouts', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Idempotent seed: clear our own names first so the list stays deterministic.
    await cleanupSeed(request, authToken, `${API}/workouts?limit=100`, `${API}/workouts`, ours)

    exerciseId = (await (await request.get(`${API}/exercises?limit=1`, { headers })).json()).data[0].id

    const create = async (name: string, duration: number, exercises: unknown[]): Promise<number> => {
      const r = await request.post(`${API}/workouts`, {
        headers,
        data: { name, duration, started_at: new Date().toISOString(), exercises },
      })
      const rb = await r.json()
      if (!rb.data?.id) throw new Error(`Failed to create seed workout "${name}": ${JSON.stringify(rb)}`)
      return rb.data.id
    }
    // One logged set so the card has a volume to show.
    workoutId = await create(SEED_WORKOUT_NAME, 2700, [
      { exercise_id: exerciseId, order_index: 0, notes: '', sets: [{ set_number: 1, reps: 10, weight: 135 }] },
    ])
    await create(SEED_SEARCH_WORKOUT_NAME, 1800, [])
  })

  test.afterAll(async ({ request }) => {
    await cleanupSeed(request, authToken, `${API}/workouts?limit=100`, `${API}/workouts`, ours)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/workouts')
  })

  test('page loads and shows workouts or empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workouts', exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: new RegExp(SEED_WORKOUT_NAME) }).or(page.getByText(/no workouts|log a workout/i)),
    ).toBeVisible()
  })

  test('create workout via add page', async ({ page }) => {
    await page.goto('/workouts/new')
    await expect(page.getByText('Log Workout', { exact: true }).first()).toBeVisible()

    await page.getByPlaceholder(/leg day|push day/i).fill(E2E_WORKOUT_NAME)

    await page.getByRole('button', { name: /add exercise/i }).first().click()
    const search = page.getByPlaceholder(/search exercises/i)
    await expect(search).toBeVisible()
    await search.fill('bench press')
    await page.getByText(/bench press/i).first().click()

    const reps = page.getByRole('textbox', { name: 'Set reps' }).first()
    const weight = page.getByRole('textbox', { name: 'Set weight' }).first()
    await reps.fill('8')
    await weight.fill('135')
    await expect(reps).toHaveValue('8')
    await expect(weight).toHaveValue('135')

    await page.getByRole('button', { name: /save workout/i }).click()
    await page.waitForURL('**/workouts')
    await expect(page.getByText(E2E_WORKOUT_NAME).first()).toBeVisible()
  })

  test('workout list shows volume in correct unit', async ({ page }) => {
    // The seeded workout logged 10 x 135, so its card carries a volume in the account's unit
    // (a fresh account defaults to lb). The volume sits beside the card's link, not inside it.
    await expect(page.getByText('1,350 lb', { exact: true })).toBeVisible()
  })

  test('delete workout shows confirm dialog', async ({ page }) => {
    await expect(page.getByText(SEED_WORKOUT_NAME)).toBeVisible({ timeout: 5000 })
    await page.getByRole('link', { name: new RegExp(SEED_WORKOUT_NAME) }).hover()
    await page.getByRole('button', { name: `Delete ${SEED_WORKOUT_NAME}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete Workout?' })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText(/permanently deleted/i)).toBeVisible()
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(SEED_WORKOUT_NAME)).toBeVisible()
  })

  test('workout detail page loads', async ({ page }) => {
    await page.goto(`/workouts/${workoutId}`)
    await expect(page.getByText(SEED_WORKOUT_NAME).first()).toBeVisible()
    // The logged exercise's block, with its set.
    await expect(page.getByText(/135/).first()).toBeVisible()
  })

  test('search filters workout list', async ({ page }) => {
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder(/search workouts/i).fill('SearchTarget')
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
    // toHaveCount(0) auto-retries until the filtered-out item is fully gone.
    await expect(page.getByText(SEED_WORKOUT_NAME)).toHaveCount(0)
  })

  test('clearing search restores full list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search workouts/i)
    await searchInput.fill('SearchTarget')
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
    await expect(page.getByText(SEED_WORKOUT_NAME)).toHaveCount(0)
    await searchInput.fill('')
    await expect(page.getByText(SEED_WORKOUT_NAME).first()).toBeVisible()
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
  })

  test('search input stays focused while typing', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workouts', exact: true })).toBeVisible()
    const searchInput = page.getByPlaceholder(/search workouts/i)
    await searchInput.click()
    await searchInput.pressSequentially('Se')
    await expect(searchInput).toBeFocused()
    await expect(searchInput).toHaveValue('Se')
  })

  test('weight unit displays consistently', async ({ page }) => {
    const savedSetting = () =>
      page.waitForResponse(r => r.url().includes('/api/v1/settings') && r.request().method() === 'PUT')

    await page.goto('/settings')
    // Wait for the settings save before navigating, so /workouts reads the updated unit: a
    // real signal, not a fixed sleep.
    await Promise.all([savedSetting(), page.getByRole('button', { name: 'kg', exact: true }).click()])
    try {
      await page.goto('/workouts')
      // 1,350 lb is about 612 kg; no card may still say lb.
      await expect(page.getByText(/^6\d\d kg$/)).toBeVisible()
      await expect(page.getByText(/ lb$/)).toHaveCount(0)
    } finally {
      await page.goto('/settings')
      await Promise.all([savedSetting(), page.getByRole('button', { name: 'lbs', exact: true }).click()])
    }
  })

  // Issue #40: finishing a workout that beat a routine's per-set target STAGES a
  // suggestion (target unchanged) + toasts it; approving on the routine applies it.
  test('finishing a workout that beats a routine target stages a suggestion to approve', async ({ page, request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }

    // Routine with one working set targeting 5 x 100.
    const created = await request.post(`${API}/programs`, {
      headers,
      data: {
        name: PROG_PROGRESSION_NAME, notes: '',
        days: [{ order_index: 0, is_rest_day: false, name: '', exercises: [{ exercise_id: exerciseId, notes: '', rest_seconds: 90, sets: [{ set_number: 1, target_reps: 5, target_weight: 100 }] }] }],
      },
    })
    const progId = (await created.json()).data.id
    try {
      const psid = (await (await request.get(`${API}/programs/${progId}`, { headers })).json()).data.days[0].exercises[0].sets[0].id

      // A list-mode session where the logged set beat the target (105 > 100).
      const session = {
        program_id: progId,
        name: PROG_PROGRESSION_NAME,
        started_at: new Date(Date.now() - 600000).toISOString(),
        exercises: [{
          exercise_id: exerciseId,
          exercise: { id: exerciseId, name: 'Bench Press', muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
          notes: '', rest_seconds: 90,
          sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 105, completed: true, program_set_id: psid }],
        }],
      }
      await page.addInitScript(({ sk, lk, s }: { sk: string; lk: string; s: unknown }) => {
        localStorage.setItem(sk, JSON.stringify(s))
        localStorage.setItem(lk, 'list')
      }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: session })

      await page.goto('/workouts/active')
      await page.getByRole('button', { name: 'Finish', exact: true }).first().click()
      await page.getByRole('dialog', { name: 'Finish Workout?' }).getByRole('button', { name: 'Finish', exact: true }).click()

      await page.waitForURL('**/workouts')
      // Toast invites a review (PR wording when it's also an all-time best; either is fine).
      await expect(page.getByText(/Tap to review 1 update/)).toBeVisible({ timeout: 5000 })

      // Staged, NOT applied: the routine target is still 100 until approved.
      const staged = await (await request.get(`${API}/programs/${progId}`, { headers })).json()
      expect(staged.data.days[0].exercises[0].sets[0].target_weight).toBe(100)
      expect(staged.data.days[0].exercises[0].sets[0].suggested_weight).toBe(105)

      // Approve on the routine: target becomes 105, suggestion cleared.
      await page.goto(`/programs/${progId}`)
      await expect(page.getByText('New targets from your last workout')).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: /Apply all/ }).click()
      await expect(page.getByText('New targets from your last workout')).toHaveCount(0, { timeout: 5000 })

      const after = await (await request.get(`${API}/programs/${progId}`, { headers })).json()
      expect(after.data.days[0].exercises[0].sets[0].target_weight).toBe(105)
      expect(after.data.days[0].exercises[0].sets[0].suggested_weight ?? null).toBeNull()
    } finally {
      const wl = await (await request.get(`${API}/workouts?limit=20`, { headers })).json()
      for (const w of (wl.data ?? []).filter((x: { name: string }) => x.name === PROG_PROGRESSION_NAME)) {
        await request.delete(`${API}/workouts/${w.id}`, { headers })
      }
      await request.delete(`${API}/programs/${progId}`, { headers })
    }
  })

  // /workout/active and /workout/start moved under /workouts (C09). Old bookmarks and the
  // installed PWA's start URL must keep landing on the same screen.
  test('the old /workout/active URL redirects to /workouts/active', async ({ page }) => {
    await page.goto('/workout/active')
    await expect(page).toHaveURL(/\/workouts\/active$/)
  })
})

// -- Gym Mode (active workout route, alternative layout) ---------------------------------

// @mobile: Gym Mode is the mobile-first full-screen workout UX; run it on the iPhone profile
// as well (the full suite also runs it on chromium at desktop width).
test.describe('Gym Mode', { tag: '@mobile' }, () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    const res = await request.get(`${API}/exercises?limit=1`, { headers: { Authorization: `Bearer ${workerAuth.token}` } })
    exerciseId = (await res.json()).data[0].id
  })

  const set = (n: number, reps = 5, weight = 100) =>
    ({ set_number: n, target_reps: reps, target_weight: weight, actual_reps: reps, actual_weight: weight, completed: false })

  const ex = (name: string, group: string, sets: unknown[]) => ({
    exercise_id: exerciseId,
    exercise: { id: exerciseId, name, muscle_group: group, equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
    notes: '',
    sets,
  })

  // An init script runs on every full load. Seeding only when nothing is stored lets the
  // refresh test see what the app persisted instead of the seed again.
  function seedGym(page: Page, name: string, exercises: unknown[]) {
    const session = { name, started_at: new Date().toISOString(), exercises }
    return page.addInitScript(({ sk, lk, s }: { sk: string; lk: string; s: unknown }) => {
      if (localStorage.getItem(sk)) return
      localStorage.setItem(sk, JSON.stringify(s))
      localStorage.setItem(lk, 'gym')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: session })
  }

  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Workout' })
  const button = (page: Page, name: string | RegExp) => dialog(page).getByRole('button', { name })
  const pill = (page: Page, name: string) => page.getByText(name, { exact: true }).locator('visible=true')

  // Minimize is the chevron at the top left; Discard lives in the workout menu.
  async function exitMenu(page: Page, item: 'Minimize' | 'Discard workout') {
    if (item === 'Minimize') return button(page, 'Minimize').click()
    await button(page, 'More options').click()
    await page.getByRole('menuitem', { name: item }).click()
  }

  async function openGym(page: Page) {
    await page.goto('/workouts/active')
    await expect(dialog(page)).toBeVisible({ timeout: 5000 })
    await expect(button(page, 'Start Workout')).toBeVisible()
  }

  async function toSets(page: Page) {
    await button(page, 'Start Workout').click()
    await button(page, 'Begin Exercise').click()
    await expect(button(page, 'Complete Set')).toBeVisible()
  }

  test('settings toggle switches layout and persists', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Gym Mode', exact: true }).click()
    expect(await page.evaluate(k => localStorage.getItem(k), LAYOUT_KEY)).toBe('gym')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    expect(await page.evaluate(k => localStorage.getItem(k), LAYOUT_KEY)).toBe('gym')

    await page.getByRole('button', { name: 'List', exact: true }).click()
    expect(await page.evaluate(k => localStorage.getItem(k), LAYOUT_KEY)).toBe('list')
  })

  test('gym mode overlay opens when navigating to active workout', async ({ page }) => {
    await seedGym(page, 'E2E Gym Test', [ex('Bench Press', 'Chest', [set(1)])])
    await openGym(page)
    // The header shows the "Workout" label above the session name.
    await expect(dialog(page).getByText('E2E Gym Test')).toBeVisible()
  })

  // The overlay covers the app but was not announced as covering it. aria-modal tells
  // assistive tech to ignore what is behind; focus containment is what actually stops Tab
  // walking into it. Without it, Finish and Remove set are invisible but still reachable by
  // keyboard, and pressing one of them mid-workout is unrecoverable.
  test('the gym overlay is a modal dialog and focus never leaves it', async ({ page }) => {
    await seedGym(page, 'E2E A11y Test', [ex('Bench Press', 'Chest', [set(1)])])
    await openGym(page)
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true')

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const escaped = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return false
        return el.closest('[role="dialog"]') === null
      })
      expect(escaped, `Tab #${i + 1} escaped from the dialog`).toBe(false)
    }
  })

  test('gym mode overview shows exercise list and stats', async ({ page }) => {
    await seedGym(page, 'E2E Stats Test', [ex('Bench Press', 'Chest', [set(1), set(2)])])
    await openGym(page)
    await expect(dialog(page).getByText('Total Sets')).toBeVisible()
    await expect(dialog(page).getByText('Bench Press').first()).toBeVisible()
  })

  test('gym mode cancel button shows confirm dialog', async ({ page }) => {
    await seedGym(page, 'E2E Cancel Test', [ex('Bench Press', 'Chest', [set(1)])])
    await openGym(page)

    await exitMenu(page, 'Discard workout')
    const confirm = page.getByRole('dialog').filter({ hasText: 'Discard workout?' })
    await expect(confirm).toBeVisible({ timeout: 3000 })
    await confirm.getByRole('button', { name: /keep going/i }).click()
    await expect(confirm).toHaveCount(0)
    await expect(button(page, 'Start Workout')).toBeVisible()
  })

  test('gym mode navigates overview → exercise info → sets', async ({ page }) => {
    await seedGym(page, 'E2E Navigation Test', [ex('Squat', 'Legs', [set(1)])])
    await openGym(page)

    await button(page, 'Start Workout').click()
    await expect(button(page, 'Begin Exercise')).toBeVisible()
    await expect(dialog(page).getByText('Squat').first()).toBeVisible()

    await button(page, 'Begin Exercise').click()
    await expect(dialog(page).getByText('Reps').first()).toBeVisible()
    await expect(button(page, 'Complete Set')).toBeVisible()
  })

  test('gym mode minimize shows active session pill', async ({ page }) => {
    await seedGym(page, 'E2E Minimize Test', [ex('Deadlift', 'Back', [set(1, 3, 150)])])
    await openGym(page)

    await exitMenu(page, 'Minimize')
    await expect(dialog(page)).toHaveCount(0)
    await expect(pill(page, 'E2E Minimize Test')).toBeVisible()

    await pill(page, 'E2E Minimize Test').click()
    await expect(button(page, 'Start Workout')).toBeVisible()
  })

  test('gym mode set stepper updates reps input', async ({ page }) => {
    await seedGym(page, 'E2E Stepper Test', [ex('OHP', 'Shoulders', [{ ...set(1, 8, 60), actual_reps: 0, actual_weight: 0 }])])
    await openGym(page)
    await toSets(page)

    const reps = dialog(page).getByRole('textbox', { name: /^reps/i })
    // NumberField selects its text on focus in a setTimeout(0); type after that tick.
    await reps.click()
    await page.evaluate(() => new Promise(r => setTimeout(r, 0)))
    await reps.fill('7')
    await expect(reps).toHaveValue('7')
  })

  test('gym mode complete set marks it done', async ({ page }) => {
    // Single set: completing it shows "Completed" (no auto-advance to a next set).
    await seedGym(page, 'E2E Complete Test', [ex('Row', 'Back', [set(1, 5, 80)])])
    await openGym(page)
    await toSets(page)

    await button(page, 'Complete Set').click()
    await expect(button(page, /^completed$/i)).toBeVisible()
  })

  test('gym mode can complete sets while the rest timer is running or paused', async ({ page }) => {
    await seedGym(page, 'E2E Complete During Rest', [ex('Bench Press', 'Chest', [set(1), set(2), set(3)])])
    await page.addInitScript(() => {
      localStorage.setItem('lyftr_rest_enabled', 'true')
      localStorage.setItem('lyftr_rest_seconds', '90')
    })
    await openGym(page)
    await button(page, 'Start Workout').click()
    await button(page, 'Begin Exercise').click()

    const complete = button(page, /^complete set$/i)
    await complete.click()
    await expect(button(page, 'Pause rest timer')).toBeVisible()
    await button(page, 'Shorten rest by 15 seconds').click()
    await button(page, 'Shorten rest by 15 seconds').click()

    // The next set remains loggable without first skipping the previous rest.
    await complete.click()
    await expect(dialog(page).getByText('Set 2 done · set 3 next')).toBeVisible()
    await expect(dialog(page).getByText(/^1:(?:2[0-9]|30)$/)).toBeVisible()
    await button(page, 'Pause rest timer').click()
    await expect(button(page, 'Resume rest timer')).toBeVisible()

    await complete.click()
    await expect(button(page, /^completed$/i)).toBeVisible()
    await expect(button(page, 'Pause rest timer')).toBeVisible()
    await expect.poll(() => page.evaluate(key => {
      const session = JSON.parse(localStorage.getItem(key)!)
      return session.exercises[0].sets.filter((s: { completed: boolean }) => s.completed).length
    }, SESSION_KEY)).toBe(3)
  })

  // #193: the rest panel used to float over Begin Exercise / Start Workout. It is docked
  // in-flow below each phase's CTA now, so it must sit under the button, not over it.
  test('gym mode rest panel sits below Begin Exercise and Start Workout', async ({ page }) => {
    await seedGym(page, 'E2E Rest Dock Test', [ex('Bench Press', 'Chest', [set(1), set(2)])])
    await page.addInitScript(() => localStorage.setItem('lyftr_rest_enabled', 'true'))
    await openGym(page)
    await toSets(page)
    await button(page, 'Complete Set').click()

    const skip = button(page, /^skip$/i)
    await expect(skip).toBeVisible({ timeout: 3000 })
    await expect(skip).toHaveCount(1)

    const expectBelow = async (cta: string) => {
      const ctaBox = await button(page, cta).boundingBox()
      const skipBox = await skip.boundingBox()
      expect(ctaBox).not.toBeNull()
      expect(skipBox).not.toBeNull()
      expect(skipBox!.y).toBeGreaterThanOrEqual(ctaBox!.y + ctaBox!.height)
    }

    // Set screen -> exercise info
    await button(page, /^info$/i).click()
    await expect(button(page, 'Begin Exercise')).toBeVisible()
    await expect(skip).toHaveCount(1)
    await expectBelow('Begin Exercise')

    // Exercise info -> overview, from the workout menu (Back is gone from the exercise screens).
    // A set is logged, so the overview's CTA continues the workout.
    await button(page, 'More options').click()
    await page.getByRole('menuitem', { name: 'Workout overview' }).click()
    await expect(button(page, 'Continue Workout')).toBeVisible()
    await expect(skip).toHaveCount(1)
    await expectBelow('Continue Workout')

    // Both CTAs stay reachable while resting.
    await button(page, 'Continue Workout').click()
    await button(page, 'Begin Exercise').click()
    await expect(skip).toBeVisible()
  })

  test('gym mode restores phase after minimize and reopen', async ({ page }) => {
    await seedGym(page, 'E2E Restore Test', [
      ex('Exercise One', 'Chest', [set(1)]),
      ex('Exercise Two', 'Back', [set(1, 5, 80)]),
    ])
    await openGym(page)

    await button(page, 'Start Workout').click()
    await button(page, 'Begin Exercise').click()
    await button(page, 'Next Exercise').click()
    await expect(dialog(page).getByText('Exercise Two').first()).toBeVisible()

    await exitMenu(page, 'Minimize')
    await expect(pill(page, 'E2E Restore Test')).toBeVisible()

    // The phase is persisted in the gym store, so the pill resumes where the lifter was.
    await pill(page, 'E2E Restore Test').click()
    await expect(dialog(page).getByText('Exercise Two').first()).toBeVisible()
  })

  test('gym mode restores phase after page refresh', async ({ page }) => {
    await seedGym(page, 'E2E Refresh Test', [
      ex('Squat', 'Legs', [set(1)]),
      ex('Deadlift', 'Back', [set(1, 3, 140)]),
    ])
    await openGym(page)

    await button(page, 'Start Workout').click()
    await button(page, 'Begin Exercise').click()
    await button(page, 'Next Exercise').click()
    await expect(dialog(page).getByText('Deadlift').first()).toBeVisible()
    await button(page, 'Begin Exercise').click()
    await expect(button(page, 'Complete Set')).toBeVisible()

    await exitMenu(page, 'Minimize')
    // Minimizing replaces /workouts/active with /workouts; reloading before that lands would
    // reload the overlay's own URL.
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workouts$/)
    await page.reload()

    // The pill reopens on the sets phase for Deadlift.
    await expect(pill(page, 'E2E Refresh Test')).toBeVisible({ timeout: 5000 })
    await pill(page, 'E2E Refresh Test').click()
    await expect(dialog(page).getByText('Deadlift').first()).toBeVisible()
    await expect(button(page, 'Complete Set')).toBeVisible()
  })
})

// -- List layout rest timer ----------------------------------------------------------------

test.describe('List layout rest timer', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    const res = await request.get(`${API}/exercises?limit=1`, { headers: { Authorization: `Bearer ${workerAuth.token}` } })
    exerciseId = (await res.json()).data[0].id
  })

  function seedList(page: Page, restEnabled: boolean) {
    const sets = [1, 2].map(n => ({ set_number: n, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }))
    const session = {
      name: 'E2E List Rest', started_at: new Date().toISOString(),
      exercises: [{
        exercise_id: exerciseId,
        exercise: { id: exerciseId, name: 'Bench Press', muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
        notes: '', rest_seconds: 20, sets,
      }],
    }
    return page.addInitScript(({ sk, lk, s, on }: { sk: string; lk: string; s: unknown; on: boolean }) => {
      if (localStorage.getItem(sk)) return
      localStorage.setItem(sk, JSON.stringify(s))
      localStorage.setItem(lk, 'list')
      localStorage.setItem('lyftr_rest_enabled', String(on))
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: session, on: restEnabled })
  }

  test('ticking a set starts the rest banner, un-ticking dismisses it, Finish stays reachable', async ({ page }) => {
    await seedList(page, true)
    await page.goto('/workouts/active')
    const pause = page.getByRole('button', { name: 'Pause rest timer' })
    await expect(pause).toHaveCount(0)

    await page.getByRole('button', { name: /^Complete set 1/ }).click()
    await expect(pause).toBeVisible()
    await expect(page.getByText(/^0:(?:1[0-9]|20)$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Finish', exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: /^Completed set 1/ }).click()
    await expect(pause).toHaveCount(0)
  })

  test('with the rest timer off, ticking a set shows no banner', async ({ page }) => {
    await seedList(page, false)
    await page.goto('/workouts/active')
    await page.getByRole('button', { name: /^Complete set 1/ }).click()
    await expect(page.getByRole('button', { name: /^Completed set 1/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pause rest timer' })).toHaveCount(0)
  })
})
