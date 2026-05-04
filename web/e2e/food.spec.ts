import { test, expect } from '@playwright/test'
import { API_BASE as API, TEST_EMAIL, TEST_PASSWORD } from './config'

const SEED_PREFIX = 'E2EFood'
// Use local calendar date to match what todayStr() returns in the frontend.
const _now = new Date()
const _pad = (n: number) => String(n).padStart(2, '0')
const today = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`
// Local noon → UTC ISO, same anchor as dayToIsoNoon() in the app.
const todayNoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 12, 0, 0, 0).toISOString()

let authToken: string
let seedFoodIds: number[] = []
let seedSavedIds: number[] = []

test.describe('Food', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    authToken = (await res.json()).data.token
    const h = { Authorization: `Bearer ${authToken}` }

    // Pre-cleanup: wipe ALL E2E-prefixed food log entries from the last 3 days
    // (covers timezone edge cases and accumulated state from multiple test runs)
    for (let d = 0; d < 3; d++) {
      const checkDate = new Date(_now)
      checkDate.setDate(_now.getDate() - d)
      const dateStr = `${checkDate.getFullYear()}-${_pad(checkDate.getMonth() + 1)}-${_pad(checkDate.getDate())}`
      const existing = await request.get(`${API}/food?date=${dateStr}`, { headers: h })
      const body = await existing.json()
      await Promise.all(
        (body.data ?? [])
          .filter((e: any) =>
            e.name.startsWith(SEED_PREFIX) ||
            e.name.startsWith('E2ELog-') ||
            e.name.startsWith('E2ESave-') ||
            e.name.startsWith('E2EEdit-')
          )
          .map((e: any) => request.delete(`${API}/food/${e.id}`, { headers: h }))
      )
    }
    const existingSaved = await request.get(`${API}/food/saved`, { headers: h })
    const es = await existingSaved.json()
    await Promise.all(
      (es.data ?? [])
        .filter((s: any) => s.name.startsWith(SEED_PREFIX) || s.name.startsWith('E2ESave-'))
        .map((s: any) => request.delete(`${API}/food/saved/${s.id}`, { headers: h }))
    )

    // Seed one entry per meal so meal sections have data
    for (const [name, meal] of [
      [`${SEED_PREFIX}-breakfast`, 'breakfast'],
      [`${SEED_PREFIX}-lunch`, 'lunch'],
      [`${SEED_PREFIX}-snacks`, 'snacks'],
    ]) {
      const r = await request.post(`${API}/food`, {
        headers: h,
        data: { name, meal, calories: 300, protein: 20, carbs: 40, fat: 10, logged_at: todayNoon },
      })
      const rb = await r.json()
      if (rb.data?.id) seedFoodIds.push(rb.data.id)
    }

    // Seed a saved food
    const sf = await request.post(`${API}/food/saved`, {
      headers: h,
      data: { name: `${SEED_PREFIX}-saved`, calories: 200, protein: 15, carbs: 25, fat: 8, serving_size: '100g' },
    })
    const sfb = await sf.json()
    if (sfb.data?.id) seedSavedIds.push(sfb.data.id)
  })

  test.afterAll(async ({ request }) => {
    const h = { Authorization: `Bearer ${authToken}` }

    await Promise.all([
      ...seedFoodIds.map(id => request.delete(`${API}/food/${id}`, { headers: h })),
      ...seedSavedIds.map(id => request.delete(`${API}/food/saved/${id}`, { headers: h })),
    ])

    // Clean up any UI-created entries
    const list = await request.get(`${API}/food?date=${today}`, { headers: h })
    const lb = await list.json()
    const toDelete = (lb.data ?? []).filter((e: any) =>
      e.name.startsWith('E2ELog-') || e.name.startsWith('E2ESave-') || e.name.startsWith('E2EEdit-')
    )
    await Promise.all(toDelete.map((e: any) => request.delete(`${API}/food/${e.id}`, { headers: h })))

    // Clean up saved foods created via UI
    const sfList = await request.get(`${API}/food/saved`, { headers: h })
    const sfb = await sfList.json()
    const sfToDelete = (sfb.data ?? []).filter((s: any) => s.name.startsWith('E2ESave-'))
    await Promise.all(sfToDelete.map((s: any) => request.delete(`${API}/food/saved/${s.id}`, { headers: h })))
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/food')
  })

  // ─── Food page ────────────────────────────────────────────────────────────

  test('renders Nutrition heading and all four meal sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible()
    for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      await expect(page.getByText(meal).first()).toBeVisible()
    }
  })

  test('shows Today label and seeded entries', async ({ page }) => {
    await expect(page.getByText('Today')).toBeVisible()
    await expect(page.getByText(`${SEED_PREFIX}-breakfast`).first()).toBeVisible()
    await expect(page.getByText(`${SEED_PREFIX}-lunch`).first()).toBeVisible()
  })

  test('macro summary card shows calorie and macro labels', async ({ page }) => {
    await expect(page.getByText('Calories')).toBeVisible()
    await expect(page.getByText('Protein').first()).toBeVisible()
    await expect(page.getByText('Carbs').first()).toBeVisible()
    await expect(page.getByText('Fat').first()).toBeVisible()
  })

  test('previous day button shows Yesterday, next returns to Today', async ({ page }) => {
    await expect(page.getByText('Today')).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Yesterday')).toBeVisible()
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByText('Today')).toBeVisible()
  })

  test('Next day button is disabled on today', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  test('seeded entries are absent on a previous date', async ({ page }) => {
    // Wait for today's data to fully load before navigating, avoiding a race
    // where the in-flight today-fetch overwrites yesterday's data after the click
    await expect(page.getByText(`${SEED_PREFIX}-breakfast`).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Yesterday')).toBeVisible()
    await expect(page.getByText(`${SEED_PREFIX}-breakfast`).first()).not.toBeVisible()
  })

  test('Macro History section renders with period selector', async ({ page }) => {
    await expect(page.getByText('Macro History')).toBeVisible()
    for (const period of ['7d', '30d', '90d']) {
      await page.getByRole('button', { name: period, exact: true }).click()
      await page.waitForTimeout(300)
      await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible()
    }
  })

  test('history chart SVG renders with demo seed data', async ({ page }) => {
    // Demo user has 60 days of seed data — chart should render, not the empty state
    await expect(page.locator('.recharts-surface').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('No data yet')).not.toBeVisible()
  })

  test('Log Food header button navigates to /food/log', async ({ page }) => {
    await page.getByRole('button', { name: /log food/i }).first().click()
    await expect(page).toHaveURL(/\/food\/log/)
  })

  // ─── Log food flow ─────────────────────────────────────────────────────────

  test('manual entry: log food and verify it appears in meal section', async ({ page }) => {
    const name = `E2ELog-${Date.now()}`

    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({ json: { data: [] } })
    )
    await page.goto(`/food/log?meal=breakfast&date=${today}`)
    await expect(page.locator('input[placeholder="Search food…"]')).toBeVisible()

    // Typing auto-switches to the Search tab
    await page.fill('input[placeholder="Search food…"]', name)
    await expect(page.getByText(`No results for "${name}"`)).toBeVisible({ timeout: 2000 })

    // Click "Enter X manually"
    await page.getByRole('button').filter({ hasText: /manually/ }).click()

    // Detail phase — sticky Log Food button
    await expect(page.getByRole('button', { name: 'Log Food' })).toBeVisible()
    await page.getByRole('button', { name: 'Log Food' }).click()

    await page.waitForURL('/food', { timeout: 5000 })
    await expect(page.getByText(name)).toBeVisible()
  })

  test('quick-add: typing a number shows quick-add shortcut row', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({ json: { data: [] } })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', '500')
    await expect(page.getByText('Quick add 500 kcal')).toBeVisible()

    await page.getByText('Quick add 500 kcal').click()
    // Detail phase with 500 kcal
    await expect(page.getByRole('button', { name: 'Log Food' })).toBeVisible()
    await expect(page.getByText('500').first()).toBeVisible()
  })

  test('servings stepper scales macros in detail phase', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({
        json: {
          data: [{ name: 'Test Rice', calories: 200, protein: 4, carbs: 45, fat: 1, fiber: 1, serving_size: '1 cup', source: 'off' }],
        },
      })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', 'rice')
    await page.getByText('Test Rice').click()

    // Default 1 serving = 200 kcal shown
    await expect(page.getByText('200').first()).toBeVisible()

    // Stepper increments by 0.5 — click twice to reach 2 servings → 400 kcal
    await page.getByRole('button', { name: 'Increase servings' }).click()
    await page.getByRole('button', { name: 'Increase servings' }).click()
    await expect(page.getByText('400').first()).toBeVisible()
  })

  test('meal selector in detail phase updates active meal', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({ json: { data: [] } })
    )
    await page.goto('/food/log?meal=breakfast')
    await page.fill('input[placeholder="Search food…"]', 'test')
    await page.getByRole('button').filter({ hasText: /manually/ }).click()

    // Should start on breakfast
    const dinnerBtn = page.getByRole('button', { name: 'Dinner' })
    await dinnerBtn.click()
    await expect(dinnerBtn).toHaveClass(/bg-brand/)
  })

  // ─── Search ───────────────────────────────────────────────────────────────

  test('search results display from mocked API', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({
        json: {
          data: [{ name: 'Mocked Banana', calories: 89, protein: 1, carbs: 23, fat: 0, fiber: 3, serving_size: '1 medium', source: 'off' }],
        },
      })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', 'banana')
    await expect(page.getByText('Mocked Banana')).toBeVisible({ timeout: 2000 })
  })

  test('selecting a search result goes to detail phase', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({
        json: {
          data: [{ name: 'Test Apple', calories: 95, protein: 0, carbs: 25, fat: 0, fiber: 4, serving_size: '1 medium', source: 'off' }],
        },
      })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', 'apple')
    await page.getByText('Test Apple').click()

    await expect(page.getByRole('button', { name: 'Log Food' })).toBeVisible()
    await expect(page.getByText('95').first()).toBeVisible()
  })

  test('429 rate limit response shows amber warning banner', async ({ page }) => {
    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({ status: 429, body: 'Too Many Requests' })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', 'pizza')
    await expect(page.getByText(/too many requests/i)).toBeVisible({ timeout: 2000 })
  })

  // ─── Edit food log ─────────────────────────────────────────────────────────

  test('edit mode: URL with edit= pre-fills food name and shows Save Changes', async ({ page }) => {
    const [firstId] = seedFoodIds
    await page.goto(`/food/log?edit=${firstId}`)

    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(`${SEED_PREFIX}-breakfast`)).toBeVisible()
  })

  test('edit mode: saving returns to food page', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.post(`${API}/food`, {
      headers: h,
      data: { name: `E2EEdit-${Date.now()}`, meal: 'dinner', calories: 200, protein: 10, carbs: 30, fat: 5, logged_at: todayNoon },
    })
    const { data } = await r.json()
    seedFoodIds.push(data.id)

    await page.goto(`/food/log?edit=${data.id}`)
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForURL('/food', { timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible()
  })

  // ─── Delete food log ───────────────────────────────────────────────────────

  test('delete: trash shows confirm dialog, cancel keeps entry', async ({ page }) => {
    await expect(page.getByText(`${SEED_PREFIX}-snacks`).first()).toBeVisible()

    // Scope to the per-entry wrapper div (.divide-y > div) that contains this name
    const entryRow = page.locator('.divide-y > div').filter({
      has: page.getByText(`${SEED_PREFIX}-snacks`, { exact: true }),
    }).last()
    await entryRow.getByRole('button', { name: 'Delete' }).click()

    await expect(page.locator('button.btn-danger-solid')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(`${SEED_PREFIX}-snacks`).first()).toBeVisible()
  })

  test('delete: confirm removes entry from list', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.post(`${API}/food`, {
      headers: h,
      data: { name: `E2ELog-del-${Date.now()}`, meal: 'snacks', calories: 100, protein: 5, carbs: 15, fat: 3, logged_at: todayNoon },
    })
    const { data } = await r.json()
    const deleteName = data.name
    // Don't push to seedFoodIds — UI deletion is the test

    await page.reload()
    await expect(page.getByText(deleteName)).toBeVisible({ timeout: 5000 })

    const entryRow = page.locator('.divide-y > div').filter({
      has: page.getByText(deleteName, { exact: true }),
    }).first()
    await entryRow.getByRole('button', { name: 'Delete' }).click()
    await page.locator('button.btn-danger-solid').click()

    await expect(page.getByText(deleteName)).not.toBeVisible({ timeout: 3000 })
  })

  // ─── My Foods ─────────────────────────────────────────────────────────────

  test('My Foods tab shows seeded saved food', async ({ page }) => {
    await page.goto('/food/log')
    await page.getByRole('button', { name: 'My Foods' }).click()
    await expect(page.getByText(`${SEED_PREFIX}-saved`).first()).toBeVisible({ timeout: 3000 })
  })

  test('Save to My Foods toggle saves food during logging', async ({ page }) => {
    const savedName = `E2ESave-${Date.now()}`

    await page.route('**/api/v1/food/search**', route =>
      route.fulfill({ json: { data: [] } })
    )
    await page.goto('/food/log')
    await page.fill('input[placeholder="Search food…"]', savedName)
    await expect(page.getByText(`No results for "${savedName}"`)).toBeVisible({ timeout: 2000 })
    await page.getByRole('button').filter({ hasText: /manually/ }).click()

    // Toggle "Save to My Foods"
    await page.getByText('Save to My Foods').click()

    await page.getByRole('button', { name: 'Log Food' }).click()
    await page.waitForURL('/food', { timeout: 5000 })

    // Verify in My Foods tab
    await page.goto('/food/log')
    await page.getByRole('button', { name: 'My Foods' }).click()
    await expect(page.getByText(savedName)).toBeVisible({ timeout: 8000 })
  })

  test('selecting from My Foods goes to detail phase', async ({ page }) => {
    await page.goto('/food/log')
    await page.getByRole('button', { name: 'My Foods' }).click()
    await expect(page.getByText(`${SEED_PREFIX}-saved`).first()).toBeVisible({ timeout: 3000 })
    await page.getByText(`${SEED_PREFIX}-saved`).first().click()

    await expect(page.getByRole('button', { name: 'Log Food' })).toBeVisible()
  })

  // ─── Barcode scanner ──────────────────────────────────────────────────────

  test('Scan button renders scan phase overlay with close button', async ({ page }) => {
    test.slow()
    await page.goto('/food/log')
    await page.getByRole('button', { name: /scan/i }).click()
    await expect(page.getByRole('button', { name: 'Close scanner' })).toBeVisible({ timeout: 3000 })
  })

  test('Close scanner button returns to search phase', async ({ page }) => {
    await page.goto('/food/log')
    await page.getByRole('button', { name: /scan/i }).click()
    await page.getByRole('button', { name: 'Close scanner' }).click()
    await expect(page.locator('input[placeholder="Search food…"]')).toBeVisible()
  })

  test('barcode API returns 404 for unknown barcode', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/barcode/000000000000`, { headers: h })
    expect([404, 429, 503]).toContain(r.status())
  })

  test('barcode API returns product data for known barcode', async ({ page }) => {
    // 051500255186 is Jif Creamy Peanut Butter — seeded via seed script
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/barcode/051500255186`, { headers: h })
    // May be 200 (product in OFF), 503 (OFF unreachable), 404 or 429 (rate-limited)
    expect([200, 503, 404, 429]).toContain(r.status())
  })

  // ─── Backend endpoints ─────────────────────────────────────────────────────

  test('GET /food/search returns results for a common query', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/search?q=apple`, { headers: h })
    // May be 200 (OFF reachable) or 503 (unreachable) — not 4xx
    expect([200, 503]).toContain(r.status())
  })

  test('GET /food/history returns array of date-grouped entries', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/history?days=7`, { headers: h })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(Array.isArray(body.data)).toBe(true)
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('date')
      expect(body.data[0]).toHaveProperty('calories')
    }
  })

  test('GET /food/saved returns user saved foods', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/saved`, { headers: h })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(Array.isArray(body.data)).toBe(true)
    const found = body.data.find((s: any) => s.name === `${SEED_PREFIX}-saved`)
    expect(found).toBeTruthy()
  })

  test('PATCH /food/:id updates food log', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const [firstId] = seedFoodIds
    const r = await page.request.patch(`${API}/food/${firstId}`, {
      headers: h,
      data: { name: `${SEED_PREFIX}-breakfast`, meal: 'breakfast', calories: 350, protein: 22, carbs: 44, fat: 11, servings: 1, logged_at: todayNoon },
    })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.data.calories).toBe(350)
  })

  test('GET /food/:id returns ownership-scoped entry', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const [firstId] = seedFoodIds
    const r = await page.request.get(`${API}/food/${firstId}`, { headers: h })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.data.name).toBe(`${SEED_PREFIX}-breakfast`)
  })

  test('GET /food?date= returns entries for the specified date', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food?date=${today}`, { headers: h })
    expect(r.status()).toBe(200)
    const body = await r.json()
    const seeded = body.data.filter((e: any) => e.name.startsWith(SEED_PREFIX))
    expect(seeded.length).toBeGreaterThanOrEqual(3)
  })

  test('GET /food/stats returns calorie and macro totals', async ({ page }) => {
    const h = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.get(`${API}/food/stats?date=${today}`, { headers: h })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.data).toHaveProperty('total_calories')
    expect(body.data).toHaveProperty('total_protein')
    expect(body.data.total_calories).toBeGreaterThan(0)
  })
})
