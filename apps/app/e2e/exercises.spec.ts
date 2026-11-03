import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// Ports web/e2e/exercises.spec.ts one test to one test. Differences from the Vite app:
//  - the detail page is /workouts/exercise/:id now (/exercises/:id redirects there, and
//    the redirect itself is covered by the legacy-route specs, not here);
//  - the PR card's label is "Personal Best" in the Expo app (the Vite page said "Your Best").

let authToken: string
let exerciseId: number
let workoutId: number
let workoutId2: number

test.describe('Exercise Detail', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token

    // Find a real exercise ID to use
    const exRes = await request.get(`${API}/exercises?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    const exBody = await exRes.json()
    exerciseId = exBody.data[0].id

    // Idempotent seed (defensive — keeps history deterministic across runs).
    await cleanupSeed(request, authToken, `${API}/workouts?limit=100`, `${API}/workouts`,
      w => typeof w.name === 'string' && w.name.startsWith('E2E Exercise History Seed'))

    // Seed two workouts on different days so history.length >= 2 (chart requires 2+ points)
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    const w1 = await request.post(`${API}/workouts`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'E2E Exercise History Seed 1',
        duration: 1800,
        started_at: yesterday,
        exercises: [{ exercise_id: exerciseId, notes: '', sets: [{ set_number: 1, reps: 5, weight: 100 }] }]
      }
    })
    workoutId = (await w1.json()).data.id

    const w2 = await request.post(`${API}/workouts`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'E2E Exercise History Seed 2',
        duration: 1800,
        started_at: new Date().toISOString(),
        exercises: [{ exercise_id: exerciseId, notes: '', sets: [{ set_number: 1, reps: 5, weight: 110 }] }]
      }
    })
    workoutId2 = (await w2.json()).data.id
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }
    if (workoutId) await request.delete(`${API}/workouts/${workoutId}`, { headers })
    if (workoutId2) await request.delete(`${API}/workouts/${workoutId2}`, { headers })
  })

  test('exercise detail page loads', async ({ page }) => {
    await page.goto(`/workouts/exercise/${exerciseId}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  // NOTE: the GET /exercises/:id/prs and /history API-contract tests were moved to
  // Go integration tests (controllers/exercises_test.go: TestGetExercisePRs_*,
  // TestGetExerciseHistory_*), which assert exact values deterministically. The
  // beforeAll seeding stays — the UI tests below depend on it.

  test('exercise detail shows PR card when history exists', async ({ page }) => {
    await page.goto(`/workouts/exercise/${exerciseId}`)
    await expect(page.getByText('Personal Best')).toBeVisible({ timeout: 5000 })
  })

  test('exercise detail shows progression chart when history exists', async ({ page }) => {
    await page.goto(`/workouts/exercise/${exerciseId}`)
    await expect(page.getByText('Weight Progression')).toBeVisible({ timeout: 5000 })
  })

  test('muscle diagram renders', async ({ page }) => {
    await page.goto(`/workouts/exercise/${exerciseId}`)
    await expect(page.getByText('Muscles Worked')).toBeVisible()
  })
})

// The wide browser keeps its query and filters in the URL (q, muscle, equipment) with history
// replace, so a reload or Back restores them. lists.spec.ts covers the query and muscle round
// trip and the history behaviour; this pins the equipment param and that all three compose.
test.describe('Exercise browser URL filters', () => {
  test('q, muscle and equipment all survive a reload and clear independently', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/workouts/exercises?q=press&muscle=chest&equipment=barbell')
    const search = page.getByPlaceholder('Search exercises…').locator('visible=true')
    await expect(search).toHaveValue('press')
    await expect(page.getByRole('button', { name: 'Remove filter: Chest' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove filter: Barbell' })).toBeVisible()

    await page.reload()
    await expect(search).toHaveValue('press')
    await expect(page.getByRole('button', { name: 'Remove filter: Barbell' })).toBeVisible()

    await page.getByRole('button', { name: 'Remove filter: Barbell' }).click()
    await expect(page).not.toHaveURL(/equipment=/)
    await expect(page).toHaveURL(/muscle=chest/)
    await expect(page).toHaveURL(/q=press/)
  })
})
