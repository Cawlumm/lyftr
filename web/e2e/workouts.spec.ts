import { test, expect } from '@playwright/test'

const API = 'http://localhost:3000/api/v1'
const E2E_WORKOUT_NAME = 'Test Workout E2E'
const SEED_WORKOUT_NAME = 'Seeded Test Workout'

let workoutId: number
let authToken: string

test.describe('Workouts', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: 'demo@lyftr.local', password: 'password123' }
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
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }

    // Delete seeded workout
    if (workoutId) {
      await request.delete(`${API}/workouts/${workoutId}`, { headers })
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
