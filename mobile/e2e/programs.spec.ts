import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// Ports web/e2e/programs.spec.ts one test to one test. Differences from the Vite app:
//  - queries are by role and accessible name: headings, links and labelled buttons replace
//    the `.card` and `input[placeholder="10"]` selectors;
//  - the set inputs in the program form placeholder "0" and are labelled "Set reps" and
//    "Set weight" (DayExercisesEditor renders ExerciseFormCard), so the fills target those;
//  - program cards are links whose Start, Edit and Delete buttons appear on hover or focus at
//    this project's desktop width, so the delete test hovers the card and does not branch on
//    a kebab.
const E2E_PROGRAM_NAME = 'Test Program E2E'
const SEED_PROGRAM_NAME = 'Seeded Test Program'
const SEED_SEARCH_PROGRAM_NAME = 'ZZZ E2E SearchTarget Program'

let programId: number
let authToken: string

const ours = (p: { name: string }) =>
  p.name === SEED_PROGRAM_NAME || p.name === SEED_SEARCH_PROGRAM_NAME || p.name === E2E_PROGRAM_NAME

test.describe('Programs', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const headers = { Authorization: `Bearer ${authToken}` }

    // Idempotent seed: clear our own names (serial: SQLite is a single writer), then create
    // exactly one of each.
    await cleanupSeed(request, authToken, `${API}/programs`, `${API}/programs`, ours)

    const createProgram = async (name: string, notes: string): Promise<number> => {
      const r = await request.post(`${API}/programs`, { headers, data: { name, notes, days: [] } })
      const rb = await r.json()
      if (!rb.data?.id) throw new Error(`Failed to create seed program "${name}": ${JSON.stringify(rb)}`)
      return rb.data.id
    }
    programId = await createProgram(SEED_PROGRAM_NAME, 'Created by E2E seed')
    await createProgram(SEED_SEARCH_PROGRAM_NAME, 'Created by E2E seed for search')
  })

  test.afterAll(async ({ request }) => {
    await cleanupSeed(request, authToken, `${API}/programs`, `${API}/programs`, ours)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/programs')
  })

  test('page loads and shows programs or empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Programs', exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: SEED_PROGRAM_NAME, exact: true }).or(page.getByText(/no programs|create your first/i)),
    ).toBeVisible()
  })

  test('create program via add page', async ({ page }) => {
    await page.goto('/programs/new')
    await expect(page.getByText('New Program', { exact: true }).first()).toBeVisible()

    await page.getByPlaceholder(/push pull legs, upper lower/i).fill(E2E_PROGRAM_NAME)
    await page.getByPlaceholder(/description or goals/i).fill('Test description')

    // Programs are day-nested: add a workout day before its exercise editor appears.
    await page.getByRole('button', { name: /add workout day/i }).click()
    await page.getByRole('button', { name: /add exercise/i }).first().click()
    const search = page.getByPlaceholder(/search exercises/i)
    await expect(search).toBeVisible()
    await search.fill('squat')
    await page.getByText(/squat/i).first().click()

    // A new set row starts empty: both inputs show the "0" placeholder.
    const reps = page.getByRole('textbox', { name: 'Set reps' }).first()
    const weight = page.getByRole('textbox', { name: 'Set weight' }).first()
    await expect(reps).toHaveAttribute('placeholder', '0')
    await expect(weight).toHaveAttribute('placeholder', '0')
    await reps.fill('5')
    await weight.fill('225')
    await expect(reps).toHaveValue('5')
    await expect(weight).toHaveValue('225')

    await page.getByRole('button', { name: /save program/i }).click()
    await page.waitForURL('**/programs')
    await expect(page.getByRole('link', { name: E2E_PROGRAM_NAME, exact: true })).toBeVisible()
  })

  test('search filters program list', async ({ page }) => {
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder(/search programs/i).fill('SearchTarget')
    await expect(page.getByText(SEED_SEARCH_PROGRAM_NAME).first()).toBeVisible()
    // toHaveCount(0) auto-retries until fully filtered out.
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
    await expect(page.getByRole('heading', { name: 'Programs', exact: true })).toBeVisible()
    const searchInput = page.getByPlaceholder(/search programs/i)
    await searchInput.click()
    await searchInput.pressSequentially('Se')
    await expect(searchInput).toBeFocused()
    await expect(searchInput).toHaveValue('Se')
  })

  test('program detail page loads', async ({ page }) => {
    await page.goto(`/programs/${programId}`)
    await expect(page.getByText(SEED_PROGRAM_NAME).first()).toBeVisible()
  })

  test('a program card opens its detail', async ({ page }) => {
    await page.getByRole('link', { name: SEED_PROGRAM_NAME, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}$`))
  })

  test('start on a program with no workout days opens its detail', async ({ page }) => {
    await page.getByRole('link', { name: SEED_PROGRAM_NAME, exact: true }).hover()
    await page.getByRole('button', { name: `Start ${SEED_PROGRAM_NAME}` }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}$`))
  })

  test('target weight unit shown correctly in program add form', async ({ page }) => {
    await page.goto('/programs/new')
    await page.getByRole('button', { name: /add workout day/i }).click()
    await page.getByRole('button', { name: /add exercise/i }).first().click()
    await page.getByPlaceholder(/search exercises/i).fill('deadlift')
    await page.getByText(/deadlift/i).first().click()

    // The weight column header carries the unit: "Weight (lb)".
    await expect(page.getByText(/^Weight \((lb|kg)\)$/).first()).toBeVisible()
  })

  test('delete program shows confirm and cancels', async ({ page }) => {
    await expect(page.getByText(SEED_PROGRAM_NAME)).toBeVisible({ timeout: 5000 })
    await page.getByRole('link', { name: SEED_PROGRAM_NAME, exact: true }).hover()
    await page.getByRole('button', { name: `Delete ${SEED_PROGRAM_NAME}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete Program?' })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('link', { name: SEED_PROGRAM_NAME, exact: true })).toBeVisible()
  })

  test('edit program preserves existing data', async ({ page }) => {
    await page.goto(`/programs/${programId}/edit`)
    await expect(page.getByRole('heading', { name: 'Edit Program' })).toBeVisible()
    await expect(page.getByRole('textbox').first()).toHaveValue(SEED_PROGRAM_NAME)
  })
})
