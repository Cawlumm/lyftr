import { test, expect } from '@playwright/test'
import { API_BASE as API, TEST_EMAIL, TEST_PASSWORD } from './config'
const E2E_WORKOUT_NAME = 'Test Workout E2E'
const SEED_WORKOUT_NAME = 'Seeded Test Workout'
const SEED_SEARCH_WORKOUT_NAME = 'ZZZ E2E SearchTarget Workout'
const LAYOUT_KEY = 'lyftr_workout_layout'
const SESSION_KEY = 'lyftr_active_session'

let workoutId: number
let searchWorkoutId: number
let authToken: string

test.describe('Workouts', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD }
    })
    const body = await res.json()
    authToken = body.data.token

    const w = await request.post(`${API}/workouts`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: SEED_WORKOUT_NAME,
        duration: 2700,
        started_at: new Date().toISOString(),
        exercises: []
      }
    })
    const wb = await w.json()
    workoutId = wb.data.id

    const sw = await request.post(`${API}/workouts`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: SEED_SEARCH_WORKOUT_NAME,
        duration: 1800,
        started_at: new Date().toISOString(),
        exercises: []
      }
    })
    const swb = await sw.json()
    searchWorkoutId = swb.data.id
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }

    // Delete seeded workouts
    if (workoutId) {
      await request.delete(`${API}/workouts/${workoutId}`, { headers })
    }
    if (searchWorkoutId) {
      await request.delete(`${API}/workouts/${searchWorkoutId}`, { headers })
    }

    // Delete any UI-created E2E workouts
    const list = await request.get(`${API}/workouts?limit=100`, { headers })
    const lb = await list.json()
    const toDelete = (lb.data ?? []).filter((w: any) => w.name === E2E_WORKOUT_NAME)
    await Promise.all(toDelete.map((w: any) =>
      request.delete(`${API}/workouts/${w.id}`, { headers })
    ))
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/workouts')
  })

  test('page loads and shows workouts or empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /workouts/i })).toBeVisible()
    const hasWorkouts = await page.locator('.card').count() > 0
    const hasEmpty = await page.getByText(/no workouts|start your first/i).isVisible().catch(() => false)
    expect(hasWorkouts || hasEmpty).toBe(true)
  })

  test('create workout via add page', async ({ page }) => {
    await page.goto('/workouts/new')
    await expect(page.getByRole('heading', { name: /log workout/i })).toBeVisible()

    await page.getByPlaceholder(/leg day|push day/i).fill(E2E_WORKOUT_NAME)
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('45')

    // Add exercise
    await page.getByRole('button', { name: /add exercise/i }).click()
    await expect(page.getByPlaceholder(/search name/i)).toBeVisible()
    await page.getByPlaceholder(/search name/i).fill('bench press')
    await page.getByText(/bench press/i).first().click()

    // Fill in set
    await page.locator('input[placeholder="10"]').first().fill('8')
    await page.locator('input[placeholder="225"]').first().fill('135')

    await page.getByRole('button', { name: /save workout/i }).click()
    await page.waitForURL('/workouts')
    await expect(page.getByText(E2E_WORKOUT_NAME).first()).toBeVisible()
  })

  test('workout list shows volume in correct unit', async ({ page }) => {
    const volumeText = page.locator('text=/\\d+ (lb|kg)/')
    if (await volumeText.count() > 0) {
      await expect(volumeText.first()).toBeVisible()
    }
  })

  test('delete workout shows confirm dialog', async ({ page }) => {
    await expect(page.getByText(SEED_WORKOUT_NAME)).toBeVisible({ timeout: 5000 })
    // On mobile the delete button is behind a kebab (⋯) menu — open it first if present
    const optionsBtn = page.getByRole('button', { name: /options/i }).first()
    if (await optionsBtn.isVisible()) {
      await optionsBtn.click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: /delete workout/i }).first().click()
    } else {
      const deleteButtons = page.getByRole('button', { name: /delete/i })
      await expect(deleteButtons.first()).toBeVisible()
      await deleteButtons.first().click()
    }
    await expect(page.getByText(/this cannot be undone/i)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText(/this cannot be undone/i)).not.toBeVisible()
  })

  test('workout detail page loads', async ({ page }) => {
    await page.goto(`/workouts/${workoutId}`)
    await expect(page.getByRole('heading')).toBeVisible()
    await expect(page.locator('.card').first()).toBeVisible()
  })

  test('search filters workout list', async ({ page }) => {
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible({ timeout: 5000 })
    const searchInput = page.getByPlaceholder(/search workouts/i)
    await searchInput.fill('SearchTarget')
    await page.waitForTimeout(500)
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
    await expect(page.getByText(SEED_WORKOUT_NAME)).not.toBeVisible()
  })

  test('clearing search restores full list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search workouts/i)
    await searchInput.fill('SearchTarget')
    await page.waitForTimeout(500)
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
    await searchInput.fill('')
    await page.waitForTimeout(500)
    await expect(page.getByText(SEED_WORKOUT_NAME)).toBeVisible()
    await expect(page.getByText(SEED_SEARCH_WORKOUT_NAME).first()).toBeVisible()
  })

  test('search input stays focused while typing', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /workouts/i })).toBeVisible()
    const searchInput = page.getByPlaceholder(/search workouts/i)
    await searchInput.click()
    await searchInput.type('S')
    await page.waitForTimeout(500)
    await expect(searchInput).toBeFocused()
  })

  test('weight unit displays consistently', async ({ page }) => {
    await page.goto('/settings')
    const kgButton = page.getByRole('button', { name: 'kg' })
    await kgButton.click()
    await page.waitForTimeout(500)

    await page.goto('/workouts')
    const volumeElements = page.locator('text=/\\d+ kg/')
    const count = await volumeElements.count()
    if (count > 0) {
      await expect(volumeElements.first()).toBeVisible()
    }

    await page.goto('/settings')
    await page.getByRole('button', { name: 'lbs' }).click()
  })
})

// ── Gym Mode (active workout route, alternative layout) ───────────────────────

let gymAuthToken: string
let gymExerciseId: number

test.describe('Gym Mode', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD }
    })
    gymAuthToken = (await res.json()).data.token

    const exRes = await request.get(`${API}/exercises?limit=1`, {
      headers: { Authorization: `Bearer ${gymAuthToken}` }
    })
    gymExerciseId = (await exRes.json()).data[0].id
  })

  function seedGymSession(page: any, name: string, exerciseName: string, sets: any[], extraExercises?: any[]) {
    const exId = gymExerciseId
    const session = {
      name,
      started_at: new Date().toISOString(),
      exercises: [
        {
          exercise_id: exId,
          exercise: { id: exId, name: exerciseName, muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: 'Stand with feet shoulder-width apart.', image_url: null },
          notes: '',
          sets,
        },
        ...(extraExercises || []),
      ],
    }
    return page.addInitScript(({ sk, lk, s }: { sk: string; lk: string; s: any }) => {
      localStorage.setItem(sk, JSON.stringify(s))
      localStorage.setItem(lk, 'gym')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: session })
  }

  test('settings toggle switches layout and persists', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()

    await page.getByRole('button', { name: /gym mode/i }).click()

    const stored = await page.evaluate((key: string) => localStorage.getItem(key), LAYOUT_KEY)
    expect(stored).toBe('gym')

    await page.reload()
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    const storedAfter = await page.evaluate((key: string) => localStorage.getItem(key), LAYOUT_KEY)
    expect(storedAfter).toBe('gym')

    // Switch back to list
    await page.getByRole('button', { name: /^list$/i }).click()
    const storedList = await page.evaluate((key: string) => localStorage.getItem(key), LAYOUT_KEY)
    expect(storedList).toBe('list')
  })

  test('gym mode overlay opens when navigating to active workout', async ({ page }) => {
    await seedGymSession(page, 'E2E Gym Test', 'Bench Press',
      [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }]
    )

    await page.goto('/workout/active')
    // Overlay header shows "Workout" label above session name
    await expect(page.getByText('Workout').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 3000 })
  })

  test('gym mode overview shows exercise list and stats', async ({ page }) => {
    await seedGymSession(page, 'E2E Stats Test', 'Bench Press', [
      { set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false },
      { set_number: 2, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false },
    ])

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Total Sets')).toBeVisible()
    await expect(page.getByText('Bench Press').first()).toBeVisible()
  })

  test('gym mode cancel button shows confirm dialog', async ({ page }) => {
    await seedGymSession(page, 'E2E Cancel Test', 'Bench Press',
      [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }]
    )

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    // X button (aria-label="Cancel workout") in overview header opens cancel confirm
    await page.getByRole('button', { name: 'Cancel workout', exact: true }).click()
    await expect(page.getByText('Cancel Workout?')).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /keep going/i }).click()
    await expect(page.getByText('Cancel Workout?')).not.toBeVisible()
  })

  test('gym mode navigates overview → exercise info → sets', async ({ page }) => {
    await seedGymSession(page, 'E2E Navigation Test', 'Squat',
      [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }]
    )

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    // Overview → exercise info
    await page.getByRole('button', { name: /start workout/i }).click()
    await expect(page.getByRole('button', { name: /begin exercise/i })).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Squat').first()).toBeVisible()

    // Exercise info → sets
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await expect(page.getByText('Reps').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible()
  })

  test('gym mode minimize shows active session pill', async ({ page }) => {
    await seedGymSession(page, 'E2E Minimize Test', 'Deadlift',
      [{ set_number: 1, target_reps: 3, target_weight: 150, actual_reps: 3, actual_weight: 150, completed: false }]
    )

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    const minimizeBtn = page.getByRole('button', { name: /minimize/i }).first()
    await expect(minimizeBtn).toBeVisible({ timeout: 3000 })
    await minimizeBtn.click()

    // Overlay gone — Start Workout CTA no longer visible
    await expect(page.getByRole('button', { name: /start workout/i })).not.toBeVisible()
    // Session name appears in pill
    await expect(page.getByText('E2E Minimize Test').first()).toBeVisible({ timeout: 3000 })

    // Tap pill → overlay reopens
    await page.getByText('E2E Minimize Test').first().click()
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 3000 })
  })

  test('gym mode set stepper updates reps input', async ({ page }) => {
    await seedGymSession(page, 'E2E Stepper Test', 'OHP',
      [{ set_number: 1, target_reps: 8, target_weight: 60, actual_reps: 0, actual_weight: 0, completed: false }]
    )

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: /start workout/i }).click()
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 3000 })

    // nth(1) — gym overlay renders after main content in DOM, list-mode input is nth(0)
    const repsInput = page.locator('input[inputmode="numeric"]').nth(1)
    await repsInput.fill('7')
    await expect(repsInput).toHaveValue('7', { timeout: 2000 })
  })

  test('gym mode complete set marks it done', async ({ page }) => {
    // Single set — completing it shows "Completed" (no auto-advance to next set)
    await seedGymSession(page, 'E2E Complete Test', 'Row', [
      { set_number: 1, target_reps: 5, target_weight: 80, actual_reps: 5, actual_weight: 80, completed: false },
    ])

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: /start workout/i }).click()
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 3000 })

    await page.getByRole('button', { name: /complete set/i }).click()
    await expect(page.getByRole('button', { name: /completed/i })).toBeVisible({ timeout: 2000 })
  })

  test('gym mode restores phase after minimize and reopen', async ({ page }) => {
    const exId = gymExerciseId
    await page.addInitScript(({ sk, lk, id }: { sk: string; lk: string; id: number }) => {
      const session = {
        name: 'E2E Restore Test',
        started_at: new Date().toISOString(),
        exercises: [
          {
            exercise_id: id,
            exercise: { id, name: 'Exercise One', muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
            notes: '',
            sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }],
          },
          {
            exercise_id: id,
            exercise: { id, name: 'Exercise Two', muscle_group: 'Back', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
            notes: '',
            sets: [{ set_number: 1, target_reps: 5, target_weight: 80, actual_reps: 5, actual_weight: 80, completed: false }],
          },
        ],
      }
      localStorage.setItem(sk, JSON.stringify(session))
      localStorage.setItem(lk, 'gym')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, id: exId })

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    // Navigate to Exercise Two's info page
    await page.getByRole('button', { name: /start workout/i }).click()
    await expect(page.getByRole('button', { name: /begin exercise/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await expect(page.getByRole('button', { name: /next exercise/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /next exercise/i }).click()
    await expect(page.getByText('Exercise Two').first()).toBeVisible({ timeout: 3000 })

    // Minimize
    await page.getByRole('button', { name: /minimize/i }).first().click()
    await expect(page.getByText('E2E Restore Test').first()).toBeVisible({ timeout: 3000 })

    // Reopen via pill — phase persisted in Zustand store
    await page.getByText('E2E Restore Test').first().click()
    await expect(page.getByText('Exercise Two').first()).toBeVisible({ timeout: 3000 })
  })

  test('gym mode restores phase after page refresh', async ({ page }) => {
    const exId = gymExerciseId
    await page.addInitScript(({ sk, lk, id }: { sk: string; lk: string; id: number }) => {
      const session = {
        name: 'E2E Refresh Test',
        started_at: new Date().toISOString(),
        exercises: [
          {
            exercise_id: id,
            exercise: { id, name: 'Squat', muscle_group: 'Legs', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
            notes: '',
            sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }],
          },
          {
            exercise_id: id,
            exercise: { id, name: 'Deadlift', muscle_group: 'Back', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
            notes: '',
            sets: [{ set_number: 1, target_reps: 3, target_weight: 140, actual_reps: 3, actual_weight: 140, completed: false }],
          },
        ],
      }
      localStorage.setItem(sk, JSON.stringify(session))
      localStorage.setItem(lk, 'gym')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, id: exId })

    await page.goto('/workout/active')
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible({ timeout: 5000 })

    // Navigate into sets for exercise 2
    await page.getByRole('button', { name: /start workout/i }).click()
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await page.getByRole('button', { name: /next exercise/i }).click()
    await expect(page.getByText('Deadlift').first()).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /begin exercise/i }).click()
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 3000 })

    // Minimize then full page refresh
    await page.getByRole('button', { name: /minimize/i }).first().click()
    await page.reload()

    // Tap pill to reopen — should land on sets phase for Deadlift
    await expect(page.getByText('E2E Refresh Test').first()).toBeVisible({ timeout: 5000 })
    await page.getByText('E2E Refresh Test').first().click()
    await expect(page.getByText('Deadlift').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 3000 })
  })
})
