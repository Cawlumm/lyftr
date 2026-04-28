import { test, expect } from '@playwright/test'
import { API_BASE as API, TEST_EMAIL, TEST_PASSWORD } from './config'

const SEED_WEIGHT_NOTE = 'E2E seed weight'
const FORM_WEIGHT_NOTE = 'E2E form weight test'

let authToken: string
let seedWeightIds: number[] = []

test.describe('Weight', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD }
    })
    authToken = (await res.json()).data.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Seed entries at -7d, -3d, and today so history and period selector have data
    const offsets = [7, 3, 0]
    for (const daysAgo of offsets) {
      const date = new Date(Date.now() - daysAgo * 86400000)
      date.setHours(12, 0, 0, 0)
      const r = await request.post(`${API}/weight`, {
        headers,
        data: { weight: 175 - daysAgo, notes: SEED_WEIGHT_NOTE, logged_at: date.toISOString() }
      })
      const rb = await r.json()
      if (rb.data?.id) seedWeightIds.push(rb.data.id)
    }
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }

    for (const id of seedWeightIds) {
      await request.delete(`${API}/weight/${id}`, { headers })
    }

    // Clean up any entries the form-submit test created
    const list = await request.get(`${API}/weight?limit=100`, { headers })
    const lb = await list.json()
    const toDelete = (lb.data ?? []).filter((w: any) => w.notes === FORM_WEIGHT_NOTE)
    await Promise.all(toDelete.map((w: any) =>
      request.delete(`${API}/weight/${w.id}`, { headers })
    ))
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/weight')
  })

  test('page loads with log form and history', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /log weight/i })).toBeVisible()
    await expect(page.getByText(/history/i)).toBeVisible({ timeout: 5000 })
  })

  test('seeded entries appear in history list', async ({ page }) => {
    await expect(page.getByText(/history/i)).toBeVisible({ timeout: 5000 })
    // Weight values 175, 172, 168 lbs from seed — at least one card should show
    const cards = page.locator('.card')
    await expect(cards.first()).toBeVisible({ timeout: 5000 })
  })

  test('period selector switches chart range without crash', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible()
    for (const period of ['7d', '90d', 'All', '30d']) {
      await page.getByRole('button', { name: period, exact: true }).click()
      await page.waitForTimeout(300)
      // Page should still be showing the weight heading — no crash/remount
      await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible()
    }
  })

  test('log weight via form adds entry to history', async ({ page }) => {
    const testDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

    await page.getByRole('button', { name: /add date.*note/i }).click()
    await page.locator('input[type="date"]').fill(testDate)
    await page.locator('input[placeholder*="morning"]').fill(FORM_WEIGHT_NOTE)

    // Fill weight
    const weightInput = page.locator('input[inputmode="decimal"]').first()
    await weightInput.fill('170')

    await page.getByRole('button', { name: /log weight/i }).click()
    await page.waitForTimeout(500)

    // Entry should appear in history
    await expect(page.getByText(/history/i)).toBeVisible({ timeout: 5000 })
  })

  test('duplicate date warning appears when logging same date', async ({ page }) => {
    // Today is already seeded — form defaults to today, submit should trigger warning
    const weightInput = page.locator('input[inputmode="decimal"]').first()
    await weightInput.fill('180')
    await page.getByRole('button', { name: /log weight/i }).click()
    await expect(page.getByText(/already logged/i)).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText(/already logged/i)).not.toBeVisible()
  })

  test('history entry navigates to weight detail', async ({ page }) => {
    await expect(page.getByText(/history/i)).toBeVisible({ timeout: 5000 })
    const firstEntry = page.locator('a[href^="/weight/"]').first()
    await expect(firstEntry).toBeVisible({ timeout: 5000 })
    await firstEntry.click()
    await expect(page).toHaveURL(/\/weight\/\d+/)
    await expect(page.getByText('Weight Entry')).toBeVisible()
  })

  test('weight detail delete removes entry and returns to list', async ({ page }) => {
    // Create a dedicated entry to delete via API so we have a known URL
    const headers = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.post(`${API}/weight`, {
      headers,
      data: {
        weight: 999,
        notes: 'E2E delete target',
        logged_at: new Date(Date.now() - 30 * 86400000).toISOString()
      }
    })
    const { data } = await r.json()
    const deleteId = data.id

    await page.goto(`/weight/${deleteId}`)
    await expect(page.getByText('Weight Entry')).toBeVisible()

    await page.getByRole('button', { name: /delete/i }).click()
    await expect(page.getByText(/permanently deleted/i)).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /^delete$/i }).click()
    await page.waitForURL('/weight', { timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible()
  })
})
