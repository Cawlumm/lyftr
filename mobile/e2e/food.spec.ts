import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'

// The food flows ported from web/e2e/food.spec.ts (C27). The Vite app lived at /food; the
// Expo app's routes are /nutrition and /nutrition/log (/food/* redirects, see the last test).
// Where the old spec reached for recharts classes, Tailwind classes or `.divide-y > div`,
// this one uses roles, aria-pressed, accessible names and links. Layout, axe, keyboard and
// CLS live in nutrition.spec.ts and are not repeated here.
const SEED_PREFIX = 'E2EFood'
// Local calendar date, the same day the app computes for "today".
const _now = new Date()
const _pad = (n: number) => String(n).padStart(2, '0')
const today = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`
// Local noon -> UTC ISO, the same anchor the app uses for a picked day.
const todayNoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 12, 0, 0, 0).toISOString()

// File-level because launchOptions cannot be set in a describe. The flags only matter once
// something asks for a camera; every other test in the file never does.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

type Row = { id: number; name: string }

let authToken: string
let seedFoodIds: number[] = []

const SEARCH = 'Search food…'
const searchBox = (page: Page) => page.getByPlaceholder(SEARCH).locator('visible=true')
// The row is a link whose accessible name is the food's name (the text sits beside it, not in it).
const diaryRow = (page: Page, name: string) => page.getByRole('link', { name, exact: true }).locator('visible=true')
const stubSearch = (page: Page, data: unknown[] = []) =>
  page.route('**/api/v1/food/search**', (route) => route.fulfill({ json: { data } }))
const manualEntry = (page: Page) => page.getByText(/manually/).locator('visible=true')
const logButton = (page: Page) => page.getByRole('button', { name: 'Log Food', exact: true })
const isDiary = (u: URL) => u.pathname === '/nutrition'

async function createLog(page: Page, name: string, meal: string, kcal = 100) {
  const res = await page.request.post(`${API}/food`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { name, meal, calories: kcal, protein: 5, carbs: 15, fat: 3, logged_at: todayNoon, logged_on: today },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data as Row
}

test.describe('Food', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    authToken = workerAuth.token
    const h = { Authorization: `Bearer ${authToken}` }
    // beforeAll runs once per project on the shared worker user, so top up rather than
    // duplicate (the fresh-per-run account already makes a wipe unnecessary).
    seedFoodIds = []
    const have = ((await (await request.get(`${API}/food?date=${today}`, { headers: h })).json()).data ?? []) as Row[]
    for (const meal of ['breakfast', 'lunch', 'snacks']) {
      const name = `${SEED_PREFIX}-${meal}`
      const found = have.find((e) => e.name === name)
      if (found) { seedFoodIds.push(found.id); continue }
      const r = await request.post(`${API}/food`, {
        headers: h,
        data: { name, meal, calories: 300, protein: 20, carbs: 40, fat: 10, logged_at: todayNoon, logged_on: today },
      })
      seedFoodIds.push((await r.json()).data.id)
    }
    const saved = ((await (await request.get(`${API}/food/saved`, { headers: h })).json()).data ?? []) as Row[]
    if (!saved.some((s) => s.name === `${SEED_PREFIX}-saved`)) {
      await request.post(`${API}/food/saved`, {
        headers: h,
        data: { name: `${SEED_PREFIX}-saved`, calories: 200, protein: 15, carbs: 25, fat: 8, serving_size: '100g' },
      })
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/nutrition')
    await expect(page.getByRole('main')).toBeVisible()
  })

  // --- Diary --------------------------------------------------------------------------

  test('renders the Nutrition heading and a meal tag for each seeded meal', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Nutrition', exact: true })).toBeVisible()
    // Meals share one list on this screen (a tag per row) rather than four sections.
    for (const meal of ['breakfast', 'lunch', 'snacks']) {
      await expect(diaryRow(page, `${SEED_PREFIX}-${meal}`)).toBeVisible()
    }
    for (const label of ['Breakfast', 'Lunch', 'Snacks']) {
      await expect(page.getByText(label, { exact: true }).locator('visible=true').first()).toBeVisible()
    }
  })

  test('shows the Today label and the seeded entries', async ({ page }) => {
    await expect(page.getByText('Today', { exact: true }).locator('visible=true')).toBeVisible()
    await expect(diaryRow(page, `${SEED_PREFIX}-breakfast`)).toBeVisible()
    await expect(diaryRow(page, `${SEED_PREFIX}-lunch`)).toBeVisible()
  })

  test('the totals card shows the calorie and macro labels', async ({ page }) => {
    await expect(page.getByText('Calories', { exact: true }).locator('visible=true')).toBeVisible()
    // Each ring's caption reads "60g Protein / 150g", so match the word, not the whole text.
    for (const macro of ['Protein', 'Carbs', 'Fat']) {
      await expect(page.getByText(macro).locator('visible=true').first()).toBeVisible()
    }
  })

  test('previous day shows Yesterday, next returns to Today', async ({ page }) => {
    const label = (text: string) => page.getByText(text, { exact: true }).locator('visible=true')
    await expect(label('Today')).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).locator('visible=true').click()
    await expect(label('Yesterday')).toBeVisible()
    await page.getByRole('button', { name: 'Next day' }).locator('visible=true').click()
    await expect(label('Today')).toBeVisible()
  })

  test('Next day is disabled on today', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Next day' }).locator('visible=true')).toBeDisabled()
  })

  test('seeded entries are absent on a previous date', async ({ page }) => {
    // Wait for today's rows first so the in-flight fetch cannot land after the click.
    await expect(diaryRow(page, `${SEED_PREFIX}-breakfast`)).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).locator('visible=true').click()
    await expect(page.getByText('Yesterday', { exact: true }).locator('visible=true')).toBeVisible()
    await expect(diaryRow(page, `${SEED_PREFIX}-breakfast`)).toHaveCount(0)
  })

  test('Macro History renders with a period selector and a chart', async ({ page }) => {
    await page.getByRole('button', { name: 'Trends', exact: true }).locator('visible=true').click()
    await expect(page.getByText('Macro History', { exact: true }).locator('visible=true')).toBeVisible()
    for (const period of ['7d', '30d', '90d']) {
      const btn = page.getByRole('button', { name: period, exact: true }).locator('visible=true')
      await btn.click()
      // The segment's pressed state is the deterministic signal the switch registered.
      await expect(btn).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('the history chart renders for an account with data, not the empty state', async ({ page }) => {
    // Today's seed is in the window, so the chart (an img role with the card's title) shows.
    await page.getByRole('button', { name: 'Trends', exact: true }).locator('visible=true').click()
    await expect(page.getByRole('img', { name: 'Macro History' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/No data yet/)).toHaveCount(0)
  })

  test('the Log Food header button opens the log flow', async ({ page }) => {
    await page.getByRole('button', { name: /log food/i }).locator('visible=true').first().click()
    await expect(page).toHaveURL(/\/nutrition\/log/)
  })

  // --- Log flow -----------------------------------------------------------------------

  // @mobile: logging food is a core on-phone action, smoked at phone viewport.
  test('manual entry: log food and see it on the diary', { tag: '@mobile' }, async ({ page }) => {
    const name = `E2ELog-${Date.now()}`
    await stubSearch(page)
    await page.goto(`/nutrition/log?meal=breakfast&date=${today}`)
    await expect(searchBox(page)).toBeVisible()

    // Typing switches to the Search tab on its own.
    await searchBox(page).fill(name)
    await expect(page.getByText(`No results for "${name}"`)).toBeVisible()
    await manualEntry(page).click()

    await logButton(page).click()
    await page.waitForURL(isDiary)
    await expect(diaryRow(page, name)).toBeVisible()
  })

  test('quick-add: typing a number offers a quick-add row', async ({ page }) => {
    await stubSearch(page)
    await page.goto('/nutrition/log')
    await searchBox(page).fill('500')
    await page.getByText('Quick add 500 kcal').click()
    await expect(logButton(page)).toBeVisible()
    await expect(page.getByText('500').first()).toBeVisible()
  })

  // @mobile: the touch stepper (+/- taps) on a phone viewport.
  test('servings stepper scales macros in the detail phase', { tag: '@mobile' }, async ({ page }) => {
    await stubSearch(page, [{ name: 'Test Rice', calories: 200, protein: 4, carbs: 45, fat: 1, fiber: 1, serving_size: '1 cup', source: 'off' }])
    await page.goto('/nutrition/log')
    await searchBox(page).fill('rice')
    await page.getByText('Test Rice').click()
    await expect(page.getByText('200').first()).toBeVisible()

    // The stepper moves by 0.5, so two taps reach 2 servings = 400 kcal.
    await page.getByRole('button', { name: 'Increase servings' }).click()
    await page.getByRole('button', { name: 'Increase servings' }).click()
    await expect(page.getByText('400').first()).toBeVisible()
  })

  // #171: OpenFoodFacts has only per-100ml figures for many oils and the amount field used
  // to floor at 0.5, so the least anyone could log was 50 ml. Drives the whole path: a hit
  // re-read through the product endpoint, then an amount typed in the pack's own unit.
  test('logs a tablespoon of oil, not half of 100 ml', { tag: '@mobile' }, async ({ page }) => {
    const hit = {
      name: 'Olive Oil', brand: 'Thrive Market', calories: 800, protein: 0, carbs: 0,
      fat: 93.3, fiber: 0, serving_size: '100 ml', serving_quantity: 100,
      serving_unit: 'ml', barcode: '0085239033265', source: 'off',
    }
    await stubSearch(page, [hit])
    await page.route('**/api/v1/food/barcode/**', (route) => route.fulfill({
      json: { data: { ...hit, calories: 120, fat: 14, serving_size: '1 Tbsp (15 ml)', serving_quantity: 15 } },
    }))

    await page.goto('/nutrition/log')
    await searchBox(page).fill('olive oil')
    // Exact: the empty state while the search is in flight contains the query too.
    await page.getByText('Olive Oil', { exact: true }).click()

    const amount = page.getByLabel('Amount in ml')
    await expect(amount).toHaveValue('15')
    await expect(page.getByText('120').first()).toBeVisible()

    await amount.fill('5')
    await expect(page.getByText('40').first()).toBeVisible()
    await expect(page.getByText(/0\.33 servings/)).toBeVisible()
  })

  // @mobile: the touch chip selector that sets the entry's meal.
  test('the meal selector in the detail phase updates the active meal', { tag: '@mobile' }, async ({ page }) => {
    await stubSearch(page)
    await page.goto('/nutrition/log?meal=breakfast')
    await searchBox(page).fill('test')
    await manualEntry(page).click()

    const breakfast = page.getByRole('button', { name: 'Breakfast', exact: true })
    const dinner = page.getByRole('button', { name: 'Dinner', exact: true })
    await expect(breakfast).toHaveAttribute('aria-pressed', 'true')
    await dinner.click()
    await expect(dinner).toHaveAttribute('aria-pressed', 'true')
    await expect(breakfast).toHaveAttribute('aria-pressed', 'false')
  })

  // --- Search -------------------------------------------------------------------------

  test('search results display from the mocked API', async ({ page }) => {
    await stubSearch(page, [{ name: 'Mocked Banana', calories: 89, protein: 1, carbs: 23, fat: 0, fiber: 3, serving_size: '1 medium', source: 'off' }])
    await page.goto('/nutrition/log')
    await searchBox(page).fill('banana')
    await expect(page.getByText('Mocked Banana')).toBeVisible()
  })

  test('selecting a search result goes to the detail phase', async ({ page }) => {
    await stubSearch(page, [{ name: 'Test Apple', calories: 95, protein: 0, carbs: 25, fat: 0, fiber: 4, serving_size: '1 medium', source: 'off' }])
    await page.goto('/nutrition/log')
    await searchBox(page).fill('apple')
    await page.getByText('Test Apple').click()
    await expect(logButton(page)).toBeVisible()
    await expect(page.getByText('95').first()).toBeVisible()
  })

  test('a 429 from search shows the rate-limit warning', async ({ page }) => {
    await page.route('**/api/v1/food/search**', (route) => route.fulfill({ status: 429, body: 'Too Many Requests' }))
    await page.goto('/nutrition/log')
    await searchBox(page).fill('pizza')
    await expect(page.getByText(/too many requests/i)).toBeVisible()
  })

  // --- Edit ---------------------------------------------------------------------------

  test('edit mode: ?edit= pre-fills the entry and offers Save Changes', async ({ page }) => {
    await page.goto(`/nutrition/log?edit=${seedFoodIds[0]}`)
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible()
    await expect(page.getByText(`${SEED_PREFIX}-breakfast`)).toBeVisible()
  })

  test('edit mode: saving returns to the diary', async ({ page }) => {
    const row = await createLog(page, `E2EEdit-${Date.now()}`, 'dinner', 200)
    await page.goto(`/nutrition/log?edit=${row.id}`)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForURL(isDiary)
    await expect(page.getByRole('heading', { name: 'Nutrition', exact: true })).toBeVisible()
  })

  // --- Delete -------------------------------------------------------------------------

  const openDelete = async (page: Page, name: string) => {
    await page.getByRole('button', { name: `${name} options` }).locator('visible=true').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  }

  test('delete: the confirm dialog can be cancelled and keeps the entry', async ({ page }) => {
    const name = `${SEED_PREFIX}-snacks`
    await expect(diaryRow(page, name)).toBeVisible()
    await openDelete(page, name)

    const confirm = page.getByRole('dialog')
    await expect(confirm.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(diaryRow(page, name)).toBeVisible()
  })

  test('delete: confirming removes the entry, and it stays gone after a reload', async ({ page }) => {
    const row = await createLog(page, `E2ELog-del-${Date.now()}`, 'snacks')
    await page.reload()
    await expect(diaryRow(page, row.name)).toBeVisible()

    await openDelete(page, row.name)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(diaryRow(page, row.name)).toHaveCount(0)

    await page.reload()
    await expect(diaryRow(page, `${SEED_PREFIX}-breakfast`)).toBeVisible()
    await expect(diaryRow(page, row.name)).toHaveCount(0)
  })

  // --- Favorites ----------------------------------------------------------------------

  const openFavorites = async (page: Page) => {
    await page.goto('/nutrition/log')
    await page.getByRole('button', { name: 'Favorites', exact: true }).locator('visible=true').click()
  }

  test('the Favorites tab shows the seeded saved food', async ({ page }) => {
    await openFavorites(page)
    await expect(page.getByText(`${SEED_PREFIX}-saved`).first()).toBeVisible()
  })

  // Favouriting is not a side effect of logging: the star acts on its own, from the detail
  // view, without the food ever being logged.
  test('starring from the detail view favourites without logging', async ({ page }) => {
    const savedName = `E2ESave-${Date.now()}`
    await stubSearch(page)
    await page.goto('/nutrition/log')
    await searchBox(page).fill(savedName)
    await expect(page.getByText(`No results for "${savedName}"`)).toBeVisible()
    await manualEntry(page).click()

    await page.getByRole('button', { name: `Add ${savedName} to Favorites` }).click()
    await expect(page.getByRole('button', { name: `Remove ${savedName} from Favorites` })).toBeVisible()

    await openFavorites(page)
    await expect(page.getByText(savedName)).toBeVisible()

    // And it was never logged: the diary has no entry for it.
    await page.goto('/nutrition')
    await expect(diaryRow(page, `${SEED_PREFIX}-breakfast`)).toBeVisible()
    await expect(page.getByText(savedName)).toHaveCount(0)
  })

  // #115: the delete endpoint and client method existed but nothing called them. Makes its
  // own row so the other Favorites tests keep the shared seed.
  test('unstarring removes it from Favorites, on the server too', async ({ page, request }) => {
    const name = `E2EDelete-${Date.now()}`
    const created = await request.post(`${API}/food/saved`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name, calories: 120, protein: 10, carbs: 12, fat: 4, serving_size: '1 cup' },
    })
    expect(created.ok()).toBeTruthy()

    await openFavorites(page)
    await expect(page.getByText(name)).toBeVisible()
    // One click, no confirmation sheet in between.
    await page.getByRole('button', { name: `Remove ${name} from Favorites` }).click()
    await expect(page.getByText(name)).toHaveCount(0)

    // The row vanishing only proves local state; a reload proves the DELETE reached the server.
    await page.reload()
    await page.getByRole('button', { name: 'Favorites', exact: true }).locator('visible=true').click()
    await expect(page.getByText(`${SEED_PREFIX}-saved`).first()).toBeVisible()
    await expect(page.getByText(name)).toHaveCount(0)
  })

  test('selecting from Favorites goes to the detail phase', async ({ page }) => {
    await openFavorites(page)
    await page.getByText(`${SEED_PREFIX}-saved`).first().click()
    await expect(logButton(page)).toBeVisible()
  })

  // --- Barcode scanner ----------------------------------------------------------------

  // The Chromium fake camera (flags at the top of the file) plus a granted permission, so the
  // scanner shows its live view (reticle and hint) instead of the permission-denied panel.
  test.describe('scanner with a fake camera', () => {
    test.use({ permissions: ['camera'] })

    test('Scan opens the scanner overlay with a close button', { tag: '@mobile' }, async ({ page, browserName }) => {
      test.slow()
      await page.goto('/nutrition/log')
      await page.getByRole('button', { name: /scan/i }).click()
      await expect(page.getByRole('button', { name: 'Close scanner' })).toBeVisible()
      // The fake-device flags are Chromium's; WebKit (the mobile project) has no camera to
      // grant, so it shows the permission panel instead of the live view.
      if (browserName === 'chromium') await expect(page.getByText('Point at a barcode')).toBeVisible()
    })

    test('Close scanner returns to the search phase', { tag: '@mobile' }, async ({ page }) => {
      await page.goto('/nutrition/log')
      await page.getByRole('button', { name: /scan/i }).click()
      await page.getByRole('button', { name: 'Close scanner' }).click()
      await expect(searchBox(page)).toBeVisible()
    })
  })

  // --- Legacy URLs --------------------------------------------------------------------

  test('the old /food and /food/log URLs land on the nutrition screens', async ({ page }) => {
    await page.goto('/food')
    await page.waitForURL(isDiary)
    await page.goto('/food/log')
    await page.waitForURL((u) => u.pathname === '/nutrition/log')
    await expect(searchBox(page)).toBeVisible()
  })

  // NOTE: the API-contract tests were moved to Go integration tests
  // (controllers/food_test.go) before this port; only the UI tests above remain.
})
