import { test, expect } from '@playwright/test'
import { API_BASE as API, TEST_EMAIL, TEST_PASSWORD } from './config'

let authToken: string
let exerciseId: number
let workoutId: number
let workoutId2: number

test.describe('Exercise Detail', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD }
    })
    authToken = (await res.json()).data.token

    // Find a real exercise ID to use
    const exRes = await request.get(`${API}/exercises?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    const exBody = await exRes.json()
    exerciseId = exBody.data[0].id

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
    await page.goto(`/exercises/${exerciseId}`)
    await expect(page.getByRole('heading')).toBeVisible()
  })

  test('PR API returns data after seeded workout', async ({ request }) => {
    const res = await request.get(`${API}/exercises/${exerciseId}/prs`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data).not.toBeNull()
    expect(body.data.weight).toBeGreaterThan(0)
    expect(body.data.estimated_1rm).toBeGreaterThan(0)
  })

  test('history API returns sessions', async ({ request }) => {
    const res = await request.get(`${API}/exercises/${exerciseId}/history`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    const point = body.data[0]
    expect(point.max_weight).toBeGreaterThan(0)
    expect(point.sets_count).toBeGreaterThan(0)
  })

  test('exercise detail shows PR card when history exists', async ({ page }) => {
    await page.goto(`/exercises/${exerciseId}`)
    await expect(page.getByText('Your Best')).toBeVisible({ timeout: 5000 })
  })

  test('exercise detail shows progression chart when history exists', async ({ page }) => {
    await page.goto(`/exercises/${exerciseId}`)
    await expect(page.getByText('Weight Progression')).toBeVisible({ timeout: 5000 })
  })

  test('muscle diagram renders', async ({ page }) => {
    await page.goto(`/exercises/${exerciseId}`)
    await expect(page.getByText('Muscles Worked')).toBeVisible()
  })
})
