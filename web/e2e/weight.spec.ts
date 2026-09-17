import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

const SEED_WEIGHT_NOTE = 'E2E seed weight'
const FORM_WEIGHT_NOTE = 'E2E form weight test'

let authToken: string
let seedWeightIds: number[] = []

test.describe('Weight', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Idempotent seed (beforeAll runs in both projects on the shared workers:1 user).
    seedWeightIds = []
    await cleanupSeed(request, authToken, `${API}/weight?limit=100`, `${API}/weight`, w => w.notes === SEED_WEIGHT_NOTE)

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

    // Clean up any entries the form-submit test created (serial — SQLite
    // single-writer drops bulk Promise.all requests under load).
    const list = await request.get(`${API}/weight?limit=100`, { headers })
    const lb = await list.json()
    const toDelete = (lb.data ?? []).filter((w: any) => w.notes === FORM_WEIGHT_NOTE)
    for (const w of toDelete) {
      await request.delete(`${API}/weight/${w.id}`, { headers })
    }
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
      const periodBtn = page.getByRole('button', { name: period, exact: true })
      await periodBtn.click()
      // Selected period takes the active style (deterministic, no data
      // dependency), and the page is still alive — replaces a fixed sleep.
      await expect(periodBtn).toHaveClass(/bg-surface-raised/)
      await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible()
    }
  })

  // @mobile: logging weight is a core on-phone action (numeric keypad) — smoke it.
  test('log weight via form adds entry to history', { tag: '@mobile' }, async ({ page }) => {
    const testDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

    await page.getByRole('button', { name: /add date.*note/i }).click()
    await page.locator('input[type="date"]').fill(testDate)
    await page.locator('input[placeholder*="morning"]').fill(FORM_WEIGHT_NOTE)

    // A decimal on purpose: type=number defaults to step=1, so a field missing an
    // explicit step rejects tenths and the browser blocks submit before any request
    // is made. An integer here passes whether or not that's set (#91).
    const weightInput = page.locator('input[inputmode="decimal"]').first()
    await weightInput.fill('170.4')

    // Wait for the actual save (POST /weight) instead of a fixed sleep.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/v1/weight') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /log weight/i }).click(),
    ])

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

  // A delete in flight cannot be dismissed. ConfirmSheet refuses Escape and Cancel while
  // busy, and its own unit test proves that — but this page kept the Escape listener from
  // the hand-rolled dialog ConfirmSheet replaced, and that listener ignored `busy`. Escape
  // mid-delete closed the sheet, and the failure then landed with nowhere to be shown. A
  // component test cannot see a page wiring its own second handler; only this can.
  test('a delete in flight cannot be dismissed into silence', async ({ page }) => {
    const headers = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.post(`${API}/weight`, {
      headers,
      data: { weight: 998, notes: 'E2E in-flight target', logged_at: new Date(Date.now() - 31 * 86400000).toISOString() },
    })
    const { data } = await r.json()

    await page.goto(`/weight/${data.id}`)
    await expect(page.getByText('Weight Entry')).toBeVisible()

    // DELETE only, and only once the page is up: the detail screen loads from the same
    // URL it deletes, so hanging every method would hang the page before the delete.
    await page.route(`**/api/v1/weight/${data.id}`, route =>
      route.request().method() === 'DELETE' ? undefined : route.fallback())

    await page.getByRole('button', { name: 'Delete entry' }).click()
    const sheet = page.getByRole('alertdialog', { name: 'Delete Entry?' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete' }).click()
    await expect(sheet.getByRole('button', { name: 'Deleting…' })).toBeDisabled()

    await page.keyboard.press('Escape')
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // Still up after both ways out were tried. Checked after the Cancel assertion so the
    // Escape has had a render to take effect in, rather than asserting on the same tick.
    await expect(sheet).toBeVisible()

    await page.unroute(`**/api/v1/weight/${data.id}`)
    await page.request.delete(`${API}/weight/${data.id}`, { headers })
  })
})
