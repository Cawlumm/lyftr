import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'
const E2E_PROGRAM_NAME = 'Test Program E2E'
const SEED_PROGRAM_NAME = 'Seeded Test Program'
const SEED_SEARCH_PROGRAM_NAME = 'ZZZ E2E SearchTarget Program'

let programId: number
let searchProgramId: number
let authToken: string

test.describe('Programs', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Idempotent seed: clear our own seed names, then create exactly one of each.
    // (Previously a retry-on-transient-failure here could double-create — if the
    // first POST committed but returned an error envelope — leaving duplicates.)
    await cleanupSeed(request, authToken, `${API}/programs`, `${API}/programs`,
      p => p.name === SEED_PROGRAM_NAME || p.name === SEED_SEARCH_PROGRAM_NAME)

    const createProgram = async (name: string, notes: string): Promise<number> => {
      const r = await request.post(`${API}/programs`, { headers, data: { name, notes, exercises: [] } })
      const rb = await r.json()
      if (!rb.data?.id) throw new Error(`Failed to create seed program "${name}": ${JSON.stringify(rb)}`)
      return rb.data.id
    }
    programId = await createProgram(SEED_PROGRAM_NAME, 'Created by E2E seed')
    searchProgramId = await createProgram(SEED_SEARCH_PROGRAM_NAME, 'Created by E2E seed for search')
  })

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: `Bearer ${authToken}` }

    // Delete seeded programs
    if (programId) {
      await request.delete(`${API}/programs/${programId}`, { headers })
    }
    if (searchProgramId) {
      await request.delete(`${API}/programs/${searchProgramId}`, { headers })
    }

    // Delete any UI-created E2E programs (serial — bulk Promise.all races
    // against SQLite's single-writer and silently drops requests).
    const list = await request.get(`${API}/programs`, { headers })
    const lb = await list.json()
    const toDelete = (lb.data ?? []).filter((p: any) => p.name === E2E_PROGRAM_NAME)
    for (const p of toDelete) {
      await request.delete(`${API}/programs/${p.id}`, { headers })
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/programs')
  })

  test('page loads and shows programs or empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /programs/i })).toBeVisible()
    const hasPrograms = await page.locator('.card').count() > 0
    const hasEmpty = await page.getByText(/no programs|create your first/i).isVisible().catch(() => false)
    expect(hasPrograms || hasEmpty).toBe(true)
  })

  test('create program via add page', async ({ page }) => {
    await page.goto('/programs/new')
    await expect(page.getByRole('heading', { name: /new program/i })).toBeVisible()

    await page.getByPlaceholder(/push pull legs, upper lower/i).fill(E2E_PROGRAM_NAME)
    await page.getByPlaceholder(/description or goals/i).fill('Test description')

    // Add exercise
    await page.getByRole('button', { name: /add exercise/i }).click()
    await expect(page.getByPlaceholder(/search name/i)).toBeVisible()
    await page.getByPlaceholder(/search name/i).fill('squat')
    await page.getByText(/squat/i).first().click()

    // Fill target sets
    await page.locator('input[placeholder="10"]').first().fill('5')
    await page.locator('input[placeholder="135"]').first().fill('225')

    await page.getByRole('button', { name: /save program/i }).click()
    await page.waitForURL('/programs')
    await expect(page.getByText(E2E_PROGRAM_NAME).first()).toBeVisible()
  })

  test('search filters program list', async ({ page }) => {
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible({ timeout: 5000 })
    const searchInput = page.getByPlaceholder(/search programs/i)
    await searchInput.fill('SearchTarget')
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible()
    // toHaveCount(0) auto-retries until fully filtered out; not.toBeVisible()
    // would strict-mode-throw on the transient 2-node re-render.
    await expect(page.getByText(SEED_PROGRAM_NAME)).toHaveCount(0)
  })

  test('clearing search restores full list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search programs/i)
    await searchInput.fill('SearchTarget')
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible()
    await searchInput.fill('')
    await expect(page.getByText(SEED_PROGRAM_NAME).first()).toBeVisible()
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible()
  })

  test('search input stays focused while typing', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /programs/i })).toBeVisible()
    const searchInput = page.getByPlaceholder(/search programs/i)
    await searchInput.click()
    await searchInput.type('S')
    await expect(searchInput).toBeFocused()
  })

  test('program detail page loads with exercises', async ({ page }) => {
    await page.goto(`/programs/${programId}`)
    await expect(page.getByRole('heading')).toBeVisible()
  })

  test('start program creates workout session', async ({ page }) => {
    const startButtons = page.getByRole('button', { name: /start workout/i })
    if (await startButtons.count() === 0) {
      test.skip()
      return
    }
    await startButtons.first().click()
    await expect(page).toHaveURL(/\/workout\/(active|start|add)|\/workouts/)
  })

  test('target weight unit shown correctly in program add form', async ({ page }) => {
    await page.goto('/programs/new')
    await page.getByRole('button', { name: /add exercise/i }).click()
    await page.getByPlaceholder(/search name/i).fill('deadlift')
    await page.getByText(/deadlift/i).first().click()

    const weightSuffix = page.locator('text=/^(lb|kg)$/')
    await expect(weightSuffix.first()).toBeVisible()
  })

  test('delete program shows confirm and cancels', async ({ page }) => {
    // Wait for programs to load before checking for buttons
    await expect(page.getByText(SEED_PROGRAM_NAME)).toBeVisible({ timeout: 5000 })

    // On mobile the delete button is behind a kebab (⋯) menu — open it first if present
    const optionsBtn = page.getByRole('button', { name: /options/i }).first()
    if (await optionsBtn.isVisible()) {
      await optionsBtn.click()
      await expect(page.getByRole('button', { name: /delete program/i })).toBeVisible({ timeout: 3000 })
      await page.getByRole('button', { name: /delete program/i }).first().click()
    } else {
      const deleteButtons = page.getByRole('button', { name: /^delete$/i })
      await expect(deleteButtons.first()).toBeVisible({ timeout: 3000 })
      await deleteButtons.first().click()
    }
    await expect(page.getByText(/this cannot be undone/i)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText(/this cannot be undone/i)).not.toBeVisible()
  })

  test('edit program preserves existing data', async ({ page }) => {
    await page.goto(`/programs/${programId}/edit`)
    await expect(page.getByRole('heading', { name: /edit program/i })).toBeVisible()
    const nameInput = page.locator('input[type="text"]').first()
    const value = await nameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })
})
