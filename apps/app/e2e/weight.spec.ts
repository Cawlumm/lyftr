import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// The weight flows ported from web/e2e/weight.spec.ts (C28). The routes are unchanged
// (/weight, /weight/:id). Where the old spec read a `.card` class or a Tailwind class for the
// selected period, this one uses roles, aria-pressed and links. Layout, axe, keyboard and CLS
// live in weight-layout.spec.ts and are not repeated here.
const SEED_WEIGHT_NOTE = 'E2E seed weight'
const FORM_WEIGHT_NOTE = 'E2E form weight test'

let authToken: string
let seedWeightIds: number[] = []

const logButton = (page: Page) => page.getByRole('button', { name: 'Log Weight', exact: true })
const history = (page: Page) => page.getByText('History', { exact: true }).locator('visible=true')
const entryLinks = (page: Page) => page.locator('a[href^="/weight/"]').locator('visible=true')
const weightHeading = (page: Page) => page.getByRole('heading', { name: 'Weight', exact: true })

test.describe('Weight', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Idempotent seed (beforeAll runs in both projects on the shared workers:1 user).
    seedWeightIds = []
    await cleanupSeed(request, authToken, `${API}/weight?limit=100`, `${API}/weight`, (w) => w.notes === SEED_WEIGHT_NOTE)

    // Entries at -7d, -3d and today so the history and the period selector have data.
    for (const daysAgo of [7, 3, 0]) {
      const date = new Date(Date.now() - daysAgo * 86400000)
      date.setHours(12, 0, 0, 0)
      const r = await request.post(`${API}/weight`, {
        headers,
        data: { weight: 175 - daysAgo, notes: SEED_WEIGHT_NOTE, logged_at: date.toISOString() },
      })
      const rb = await r.json()
      if (rb.data?.id) seedWeightIds.push(rb.data.id)
    }
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }
    for (const id of seedWeightIds) await request.delete(`${API}/weight/${id}`, { headers })

    // Serial: SQLite is single-writer and drops bulk Promise.all requests under load.
    const list = await request.get(`${API}/weight?limit=100`, { headers })
    const toDelete = ((await list.json()).data ?? []).filter((w: { notes?: string }) => w.notes === FORM_WEIGHT_NOTE)
    for (const w of toDelete) await request.delete(`${API}/weight/${w.id}`, { headers })
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/weight')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('page loads with log form and history', async ({ page }) => {
    await expect(weightHeading(page)).toBeVisible()
    await expect(logButton(page)).toBeVisible()
    await expect(history(page)).toBeVisible({ timeout: 5000 })
  })

  test('seeded entries appear in history list', async ({ page }) => {
    await expect(history(page)).toBeVisible({ timeout: 5000 })
    // The row is a link to /weight/:id; at least one of the seeded entries shows.
    await expect(entryLinks(page).first()).toBeVisible({ timeout: 5000 })
  })

  test('period selector switches chart range without crash', async ({ page }) => {
    await expect(weightHeading(page)).toBeVisible()
    for (const period of ['7d', '90d', 'All', '30d']) {
      const periodBtn = page.getByRole('button', { name: period, exact: true }).locator('visible=true')
      await periodBtn.click()
      // The chosen segment is a pressed toggle (deterministic, no data dependency) and the
      // page is still alive.
      await expect(periodBtn).toHaveAttribute('aria-pressed', 'true')
      await expect(weightHeading(page)).toBeVisible()
    }
  })

  test('log weight via form adds entry to history', { tag: '@mobile' }, async ({ page }) => {
    const testDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

    await page.getByText('Add date & note', { exact: true }).locator('visible=true').click()
    // A real <input type="date"> on web (DateInput.web), not a picker sheet.
    await page.locator('input[type="date"]').fill(testDate)
    await page.getByPlaceholder(/morning/).fill(FORM_WEIGHT_NOTE)

    // A decimal on purpose: a field missing an explicit step rejects tenths and the browser
    // blocks submit before any request is made. An integer passes either way (#91).
    await page.locator('input[inputmode="decimal"]').first().fill('170.4')

    const [post] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/weight') && r.request().method() === 'POST'),
      logButton(page).click(),
    ])
    expect(post.ok()).toBeTruthy()
    expect(post.request().postDataJSON().weight).toBe(170.4)

    await expect(history(page)).toBeVisible({ timeout: 5000 })
  })

  test('duplicate date warning appears when logging same date', async ({ page }) => {
    // Today is already seeded: the form defaults to today, so submit triggers the warning.
    await page.locator('input[inputmode="decimal"]').first().fill('180')
    await logButton(page).click()
    await expect(page.getByText(/already logged/i)).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByText(/already logged/i)).not.toBeVisible()
  })

  test('history entry navigates to weight detail', async ({ page }) => {
    await expect(history(page)).toBeVisible({ timeout: 5000 })
    const firstEntry = entryLinks(page).first()
    await expect(firstEntry).toBeVisible({ timeout: 5000 })
    await firstEntry.click()
    await expect(page).toHaveURL(/\/weight\/\d+/)
    await expect(page.getByText('Weight Entry', { exact: true })).toBeVisible()
  })

  test('weight detail delete removes entry and returns to list', async ({ page }) => {
    // A dedicated entry made through the API so the URL is known.
    const r = await page.request.post(`${API}/weight`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { weight: 999, notes: 'E2E delete target', logged_at: new Date(Date.now() - 30 * 86400000).toISOString() },
    })
    const { data } = await r.json()

    await page.goto(`/weight/${data.id}`)
    await expect(page.getByText('Weight Entry', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Delete entry' }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete Entry?' })
    await expect(sheet.getByText(/permanently deleted/i)).toBeVisible({ timeout: 3000 })
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForURL('/weight', { timeout: 5000 })
    await expect(weightHeading(page)).toBeVisible()
  })

  // A delete in flight cannot be dismissed. ConfirmSheet refuses Escape and Cancel while
  // busy, and its own unit test proves that; this proves the page does not wire a second
  // handler that ignores `busy` (the failure would then land with nowhere to be shown).
  test('a delete in flight cannot be dismissed into silence', async ({ page }) => {
    const headers = { Authorization: `Bearer ${authToken}` }
    const r = await page.request.post(`${API}/weight`, {
      headers,
      data: { weight: 998, notes: 'E2E in-flight target', logged_at: new Date(Date.now() - 31 * 86400000).toISOString() },
    })
    const { data } = await r.json()

    await page.goto(`/weight/${data.id}`)
    await expect(page.getByText('Weight Entry', { exact: true })).toBeVisible()

    // DELETE only, and only once the page is up: the detail loads from the URL it deletes.
    await page.route(`**/api/v1/weight/${data.id}`, (route) =>
      route.request().method() === 'DELETE' ? undefined : route.fallback())

    await page.getByRole('button', { name: 'Delete entry' }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete Entry?' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'Deleting…' })).toBeDisabled()

    await page.keyboard.press('Escape')
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // Checked after the Cancel assertion so the Escape has had a render to take effect in.
    await expect(sheet).toBeVisible()

    await page.unroute(`**/api/v1/weight/${data.id}`)
    await page.request.delete(`${API}/weight/${data.id}`, { headers })
  })
})
