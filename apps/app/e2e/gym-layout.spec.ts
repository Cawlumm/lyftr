import type { Locator, Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { WIDTH_GROUPS, sweepWidths } from './widths'

// Gym mode on web (C30). The overlay is a modal dialog named "Workout" over the whole app:
// focus stays inside it, Escape minimizes it, and from lg it is a centred panel instead of a
// phone screen across a desktop. Browser Back leaves it exactly as Minimize does: the session
// lives in the store, and the session pill resumes it. Native keeps the in-screen overlay.
const MAX_W_2XL = 672
const SESSION = 'E2E Gym Layout'

let exerciseId: number

test.beforeAll(async ({ request, workerAuth }) => {
  const res = await request.get(`${API_BASE}/exercises?limit=1`, { headers: { Authorization: `Bearer ${workerAuth.token}` } })
  exerciseId = (await res.json()).data[0].id
})

const set = (n: number) => ({ set_number: n, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: false })

// The same keys the app persists to (AsyncStorage on web is localStorage). An init script runs
// on every full load, so a test navigates inside the app after its one goto.
function seed(page: Page, { rest = false } = {}) {
  const session = {
    name: SESSION,
    started_at: new Date().toISOString(),
    exercises: [{
      exercise_id: exerciseId,
      exercise: { id: exerciseId, name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
      notes: '',
      rest_seconds: 15,
      sets: [set(1), set(2)],
    }],
  }
  return page.addInitScript(({ s, rest }) => {
    localStorage.setItem('lyftr_active_session', JSON.stringify(s))
    localStorage.setItem('lyftr_gym_ui', JSON.stringify({ phase: 'overview', exIdx: 0, setIdx: 0 }))
    localStorage.setItem('lyftr_workout_layout', 'gym')
    localStorage.setItem('lyftr_rest_enabled', String(rest))
  }, { s: session, rest })
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Workout' })
const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true })
const pill = (page: Page) => page.getByText(SESSION, { exact: true }).locator('visible=true')
const box = async (l: Locator) => (await l.boundingBox())!
const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)
const storedSession = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lyftr_active_session') ?? 'null'))

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return
  }
  throw new Error('Tab never reached the target')
}

// NumberField selects its text on focus, and react-native-web does that in a setTimeout(0)
// (Safari needs it). A person cannot type inside that tick; Playwright can, and the select would
// then swallow the first digit. So a field is typed into after the tick, as a person would.
const settle = (page: Page) => page.evaluate(() => new Promise(r => setTimeout(r, 0)))

async function openGym(page: Page, width: number, height = 800) {
  await page.setViewportSize({ width, height })
  await page.goto('/workouts/active')
  await expect(dialog(page)).toBeVisible()
  await expect(button(dialog(page), 'Start Workout')).toBeVisible()
}

async function toSets(page: Page) {
  await button(dialog(page), 'Start Workout').click()
  await button(dialog(page), 'Begin Exercise').click()
  await expect(button(dialog(page), 'Complete Set')).toBeVisible()
}

for (const widths of WIDTH_GROUPS) {
  test(`gym mode does not scroll horizontally at ${widths.join('/')}px`, async ({ page }, testInfo) => {
    const shoot = [390, 768, 1280, 1920]
    await seed(page)
    await openGym(page, widths[0])
    await sweepWidths(page, testInfo, 'overview', widths, { shoot, height: 800 })
    await page.setViewportSize({ width: widths[0], height: 800 })
    await toSets(page)
    await sweepWidths(page, testInfo, 'sets', widths, { shoot, height: 800 })
  })
}

test('the overlay is a modal dialog and focus never leaves it in 25 Tabs', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'true')
  for (const phase of ['overview', 'sets']) {
    if (phase === 'sets') await toSets(page)
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
      expect(inside, `${phase}: Tab #${i + 1} left the dialog`).toBe(true)
    }
  }
})

test('at 1280 gym mode is a centred panel no wider than max-w-2xl', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  const panel = await box(page.getByTestId('gym-panel'))
  expect(panel.width).toBeLessThanOrEqual(MAX_W_2XL)
  expect(Math.abs(panel.x + panel.width / 2 - 640)).toBeLessThanOrEqual(2)
  expect(panel.y).toBeGreaterThan(0)
})

test('at 390 gym mode fills the screen @mobile', async ({ page }) => {
  await seed(page)
  await openGym(page, 390, 844)
  const panel = await box(page.getByTestId('gym-panel'))
  expect(panel.x).toBe(0)
  expect(panel.width).toBe(390)
  expect(panel.height).toBe(844)
})

test('Escape minimizes to the session pill, which reopens the same phase', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  await toSets(page)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page).toHaveURL(/\/workouts$/)
  await pill(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(button(dialog(page), 'Complete Set')).toBeVisible()
})

test('Escape in the discard confirmation closes only the confirmation', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  await page.getByRole('button', { name: 'Discard workout' }).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Discard workout?' })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(dialog(page)).toBeVisible()
  expect((await storedSession(page))?.name).toBe(SESSION)
})

test('notes save on Enter and revert on Escape without closing the dialog', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  await toSets(page)
  const notes = dialog(page).getByPlaceholder('+ Add note…')
  await notes.click()
  await page.keyboard.type('Slow eccentric')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await storedSession(page)).exercises[0].notes).toBe('Slow eccentric')
  await notes.click()
  await page.keyboard.type(', paused')
  await page.keyboard.press('Escape')
  await expect(notes).toHaveValue('Slow eccentric')
  await expect(dialog(page)).toBeVisible()
  expect((await storedSession(page)).exercises[0].notes).toBe('Slow eccentric')
})

for (const from of ['/workouts', '/'] as const) {
  test(`browser Back from gym mode keeps the session (opened from ${from})`, async ({ page }) => {
    await seed(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(from)
    await pill(page).click()
    await expect(dialog(page)).toBeVisible()
    await toSets(page)
    await page.goBack()
    await expect(page).toHaveURL(from === '/' ? /\/$/ : /\/workouts$/)
    await expect(dialog(page)).toBeHidden()
    expect((await storedSession(page))?.name).toBe(SESSION)
    await pill(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(button(dialog(page), 'Complete Set')).toBeVisible()
  })
}

test('keyboard only: complete a set from the overview', async ({ page }) => {
  await seed(page)
  await openGym(page, 1280)
  await tabTo(page, button(dialog(page), 'Start Workout'))
  await page.keyboard.press('Enter')
  await tabTo(page, button(dialog(page), 'Begin Exercise'))
  await page.keyboard.press('Enter')
  const reps = dialog(page).getByLabel('Reps', { exact: true })
  await tabTo(page, reps)
  await settle(page)
  await page.keyboard.type('8')
  await tabTo(page, dialog(page).getByLabel('Weight', { exact: true }))
  await settle(page)
  await page.keyboard.type('105')
  await tabTo(page, button(dialog(page), 'Complete Set'))
  await page.keyboard.press('Enter')
  await expect(button(dialog(page), 'Set 1, done')).toBeVisible()
  await expect(button(dialog(page), 'Set 2')).toHaveAttribute('aria-pressed', 'true')
  const done = (await storedSession(page)).exercises[0].sets[0]
  expect(done).toMatchObject({ completed: true, actual_reps: 8, actual_weight: 105 })
})

for (const [phase, width] of [['overview', 1280], ['sets', 1280], ['overview', 390], ['sets', 390]] as const) {
  test(`axe: gym ${phase} at ${width} has no structural violations`, async ({ page }) => {
    await seed(page)
    await openGym(page, width, width === 390 ? 844 : 800)
    if (phase === 'sets') await toSets(page)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the rest-over check does not pulse', async ({ page }) => {
    await seed(page, { rest: true })
    await openGym(page, 1280)
    await toSets(page)
    await button(dialog(page), 'Complete Set').click()
    await page.getByRole('button', { name: 'Shorten rest by 15 seconds' }).click()
    const chip = page.getByTestId('rest-done-pulse')
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.width).toBe(48)
    for (let i = 0; i < 5; i++) {
      expect(await chip.evaluate(el => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      await page.waitForTimeout(80)
    }
  })
})

test('the keep-awake warning shows inside the dialog and one dismissal clears it', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true }))
  await seed(page)
  await openGym(page, 390)
  const warning = page.getByText(/The screen may turn off during your workout/)
  await expect(dialog(page).getByText(/The screen may turn off during your workout/)).toBeVisible()
  await expect(warning).toHaveCount(1)
  await dialog(page).getByRole('button', { name: /dismiss|close/i }).click()
  await expect(warning).toHaveCount(0)
})
