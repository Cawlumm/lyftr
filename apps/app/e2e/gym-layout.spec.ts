import type { Locator, Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { WIDTH_GROUPS, noHorizontalScroll, sweepWidths } from './widths'

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

const NAMES = ['Bench Press', 'Barbell Row', 'Overhead Press']

// The same keys the app persists to (AsyncStorage on web is localStorage). An init script runs
// on every full load, so a test navigates inside the app after its one goto, unless it seeds
// with `once`, which leaves what the app stored for a reload to read back.
function seed(page: Page, { rest = false, count = 1, names = [] as string[], once = false } = {}) {
  const session = {
    name: SESSION,
    started_at: new Date().toISOString(),
    exercises: Array.from({ length: names.length || count }, (_, i) => ({
      exercise_id: exerciseId,
      exercise: { id: exerciseId, name: names[i] ?? 'Bench Press', muscle_group: 'chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
      notes: '',
      rest_seconds: 15,
      sets: [set(1), set(2)],
    })),
  }
  return page.addInitScript(({ s, rest, once }) => {
    if (once && localStorage.getItem('lyftr_active_session')) return
    localStorage.setItem('lyftr_active_session', JSON.stringify(s))
    localStorage.setItem('lyftr_gym_ui', JSON.stringify({ phase: 'overview', exIdx: 0, setIdx: 0 }))
    localStorage.setItem('lyftr_workout_layout', 'gym')
    localStorage.setItem('lyftr_rest_enabled', String(rest))
  }, { s: session, rest, once })
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Workout' })
const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true })
const pill = (page: Page) => page.getByText(SESSION, { exact: true }).locator('visible=true')
const box = async (l: Locator) => (await l.boundingBox())!
const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)
const storedSession = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lyftr_active_session') ?? 'null'))
const SHEET_DIALOG = '[role="dialog"][aria-labelledby]'
const heading = (page: Page) => dialog(page).getByTestId('gym-exercise-switcher')
const exercisesSheet = (page: Page) => page.getByRole('dialog', { name: 'Exercises' })
const storedNames = async (page: Page) => (await storedSession(page)).exercises.map((e: { exercise: { name: string } }) => e.exercise.name)

// The top row holds only whole-workout things: Minimize, the clock, Finish (an icon) and the menu, in
// that order, none over another, all inside the panel, every control a 44px target, and the menu the
// right-most of them.
async function barFits(page: Page, labels: { minimize: string; more: string; finish: string }) {
  const gym = page.getByRole('dialog').filter({ has: page.getByTestId('gym-panel') })
  const panel = await box(page.getByTestId('gym-panel'))
  const row = [
    await box(button(gym, labels.minimize)),
    await box(gym.getByTestId('gym-clock')),
    await box(button(gym, labels.finish)),
    await box(button(gym, labels.more)),
  ]
  for (let i = 0; i < row.length; i++) {
    if (i !== 1) expect(row[i].height, `control ${i} height`).toBeGreaterThanOrEqual(44)
    expect(row[i].x).toBeGreaterThanOrEqual(panel.x)
    expect(row[i].x + row[i].width).toBeLessThanOrEqual(panel.x + panel.width)
    if (i > 0) expect(row[i].x, `control ${i} overlaps the one before`).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].width)
  }
  expect(row[2].width, 'Finish width').toBeGreaterThanOrEqual(44)
  expect(row[2].height, 'Finish height').toBeGreaterThanOrEqual(44)
  const right = Math.max(...row.map(r => r.x + r.width))
  expect(row[3].x + row[3].width, 'the menu is the right-most control').toBe(right)
}

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

const EN_BAR = { minimize: 'Minimize', more: 'More options', finish: 'Finish' }

for (const width of [390, 1280]) {
  test(`the heading says where you are at ${width}, and the top row fits`, async ({ page }) => {
    await seed(page, { names: NAMES })
    await openGym(page, width, width === 390 ? 844 : 800)
    await toSets(page)
    await expect(heading(page)).toHaveAccessibleName('Exercises, 1 of 3, Bench Press, chest, 0/2 sets done')
    await expect(heading(page)).toContainText('Bench Press')
    await expect(heading(page)).toContainText('1/3')
    await expect(heading(page)).toContainText('0/2 sets done')
    // The name is shown once, in the heading; nothing in the top row repeats it.
    await expect(dialog(page).getByText('Bench Press', { exact: true })).toHaveCount(1)
    await expect(button(dialog(page), 'Back')).toHaveCount(0)
    await expect(dialog(page).getByTestId('gym-clock')).toContainText('0/6 sets')
    await barFits(page, EN_BAR)
  })
}

test('at 320 the top row keeps its 44px targets and the heading ellipsizes @mobile', async ({ page }) => {
  await seed(page, { names: ['Romanian Deadlift with a Long Pause at the Bottom', ...NAMES.slice(1)] })
  await openGym(page, 320, 700)
  await toSets(page)
  await expect(heading(page)).toHaveAccessibleName('Exercises, 1 of 3, Romanian Deadlift with a Long Pause at the Bottom, chest, 0/2 sets done')
  await barFits(page, EN_BAR)
  const panel = await box(page.getByTestId('gym-panel'))
  const h = await box(heading(page))
  expect(h.x + h.width).toBeLessThanOrEqual(panel.x + panel.width)
  expect(await noHorizontalScroll(page)).toBe(true)
})

test('the heading opens the exercises sheet, which jumps to the exercise picked', async ({ page }) => {
  await seed(page, { names: NAMES })
  await openGym(page, 390, 844)
  await toSets(page)
  await heading(page).click()
  const sheet = exercisesSheet(page)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: '1. Bench Press, current exercise, 0/2 sets done' })).toHaveAttribute('aria-current', 'step')
  await expect(sheet.getByRole('button', { name: '3. Overhead Press, 0/2 sets done' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page })
    // The sheet alone: the gym dialog under it keeps aria-modal while a second RN-web Modal is
    // stacked on it, which axe flags whatever the sheet (the discard confirmation too).
    .include(SHEET_DIALOG)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

  await sheet.getByRole('button', { name: /^3\. Overhead Press/ }).click()
  await expect(sheet).toBeHidden()
  await expect(button(dialog(page), 'Begin Exercise')).toBeVisible()
  // The info phase's title is the same switcher: with Back gone, it is the way to any other.
  await expect(heading(page)).toHaveAccessibleName('Exercises, 3 of 3, Overhead Press, chest, Barbell, strength')
  await heading(page).click()
  await sheet.getByRole('button', { name: /^1\. Bench Press/ }).click()
  await expect(heading(page)).toHaveAccessibleName('Exercises, 1 of 3, Bench Press, chest, Barbell, strength')
})

test('Reorder is reachable from the exercise screen, and the order survives a reload', async ({ page }) => {
  await seed(page, { names: NAMES, once: true })
  await openGym(page, 390, 844)
  await toSets(page)
  await heading(page).click()
  await exercisesSheet(page).getByRole('button', { name: 'Reorder exercises' }).click()
  // The same sheet, now the reorder list: named for it, with the drag rows and arrows.
  const sheet = page.getByRole('dialog', { name: 'Reorder exercises' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('reorder-body-0')).toBeVisible()
  await sheet.getByRole('button', { name: 'Move Bench Press down' }).click()
  await expect(sheet.locator('[aria-live="polite"]')).toHaveText('Bench Press moved to position 2 of 3')
  // Done goes back to the list, which follows the exercise being worked to its new place.
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(exercisesSheet(page).getByRole('button', { name: '2. Bench Press, current exercise, 0/2 sets done' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exercisesSheet(page)).toBeHidden()
  await expect(button(dialog(page), 'Complete Set')).toBeVisible()
  await expect(heading(page)).toHaveAccessibleName('Exercises, 2 of 3, Bench Press, chest, 0/2 sets done')
  expect(await storedNames(page)).toEqual(['Barbell Row', 'Bench Press', 'Overhead Press'])

  await page.reload()
  await expect(dialog(page)).toBeVisible()
  await expect(heading(page)).toHaveAccessibleName('Exercises, 2 of 3, Bench Press, chest, 0/2 sets done')
  await heading(page).click()
  await exercisesSheet(page).getByRole('button', { name: 'Reorder exercises' }).click()
  const names = await page.getByRole('dialog', { name: 'Reorder exercises' }).getByRole('button', { name: /^Move .* up$/ })
    .evaluateAll(els => els.map(e => (e.getAttribute('aria-label') ?? '').replace(/^Move (.*) up$/, '$1')))
  expect(names).toEqual(['Barbell Row', 'Bench Press', 'Overhead Press'])
})

test('the overview reorder button opens the same sheet on its reorder list; Done closes it', async ({ page }) => {
  await seed(page, { names: NAMES })
  await openGym(page, 390, 844)
  await button(dialog(page), 'Reorder exercises').click()
  const sheet = page.getByRole('dialog', { name: 'Reorder exercises' })
  await expect(sheet.getByTestId('reorder-body-2')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await expect(exercisesSheet(page)).toBeHidden()
  await expect(button(dialog(page), 'Start Workout')).toBeVisible()
})

test('the menu holds the workout actions and discards only once confirmed; the chevron minimizes', async ({ page }) => {
  await seed(page, { names: NAMES })
  await openGym(page, 390, 844)
  await toSets(page)
  const more = button(dialog(page), 'More options')
  await more.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Add exercise', 'Reorder exercises', 'All exercises', 'Workout overview', 'Discard workout'])
  await expect(page.getByRole('menu').getByRole('separator')).toHaveCount(1)
  await page.getByRole('menuitem', { name: 'Discard workout' }).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Discard workout?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Keep Going' }).click()
  await expect(confirm).toBeHidden()
  expect((await storedSession(page))?.name).toBe(SESSION)

  await button(dialog(page), 'Minimize').click()
  await expect(dialog(page)).toBeHidden()
  await pill(page).click()
  await expect(button(dialog(page), 'Complete Set')).toBeVisible()

  await more.click()
  await page.getByRole('menuitem', { name: 'Discard workout' }).click()
  await confirm.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
  expect(await storedSession(page)).toBeNull()
})

test('the menu opens the picker, the reorder list, the exercise list and the overview', async ({ page }) => {
  await seed(page, { names: NAMES })
  await openGym(page, 390, 844)
  await toSets(page)
  const more = button(dialog(page), 'More options')

  await more.click()
  await page.getByRole('menuitem', { name: 'Add exercise' }).click()
  await expect(page.getByRole('heading', { name: 'Add Exercise' })).toBeVisible()
  await page.getByRole('button', { name: 'Close exercise picker' }).click()
  await expect(page.getByRole('heading', { name: 'Add Exercise' })).toBeHidden()

  await more.click()
  await page.getByRole('menuitem', { name: 'Reorder exercises' }).click()
  const reorder = page.getByRole('dialog', { name: 'Reorder exercises' })
  await expect(reorder.getByTestId('reorder-body-0')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(reorder).toBeHidden()

  await more.click()
  await page.getByRole('menuitem', { name: 'All exercises' }).click()
  await expect(exercisesSheet(page).getByRole('button', { name: /^1\. Bench Press, current exercise/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exercisesSheet(page)).toBeHidden()

  await more.click()
  await page.getByRole('menuitem', { name: 'Workout overview' }).click()
  await expect(button(dialog(page), 'Start Workout')).toBeVisible()
  // The overview keeps its own header: the chevron, the workout's name, its reorder button, the menu.
  await expect(button(dialog(page), 'Minimize')).toBeVisible()
  await expect(button(dialog(page), 'Reorder exercises')).toBeVisible()
  await more.click()
  await expect(page.getByRole('menuitem')).toHaveText(['Discard workout'])
})

test('keyboard: Minimize, Finish, the menu, then the heading; Escape returns focus to what opened it', async ({ page }) => {
  await seed(page, { names: NAMES })
  await openGym(page, 1280)
  await toSets(page)
  const minimize = button(dialog(page), 'Minimize')
  const more = button(dialog(page), 'More options')
  const finish = button(dialog(page), 'Finish')
  await tabTo(page, minimize)
  for (const next of [finish, more, heading(page)]) {
    await page.keyboard.press('Tab')
    await expect(next).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(exercisesSheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exercisesSheet(page)).toBeHidden()
  await expect(dialog(page)).toBeVisible()
  await expect(heading(page)).toBeFocused()

  // The menu: Enter opens it on its first item, Escape closes it onto its button, and gym mode
  // stays open under both.
  await tabTo(page, more)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Add exercise' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Discard workout' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(more).toBeFocused()
  await expect(dialog(page)).toBeVisible()

  // A sheet opened from the menu hands focus back to the menu button when it closes.
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'All exercises' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(exercisesSheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exercisesSheet(page)).toBeHidden()
  await expect(more).toBeFocused()
  await expect(dialog(page)).toBeVisible()

  // A jump from the sheet changes phase and remounts the heading; focus lands on the new one.
  await tabTo(page, heading(page))
  await page.keyboard.press('Enter')
  await exercisesSheet(page).getByRole('button', { name: /^2\. Barbell Row/ }).focus()
  await page.keyboard.press('Enter')
  await expect(exercisesSheet(page)).toBeHidden()
  await expect(button(dialog(page), 'Begin Exercise')).toBeVisible()
  await expect(heading(page)).toBeFocused()

  // So does going to the overview from the menu: focus lands on its Minimize.
  await tabTo(page, more)
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Workout overview' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(button(dialog(page), 'Start Workout')).toBeVisible()
  await expect(minimize).toBeFocused()
})

test('the progress line has a segment per exercise, filled by its sets, hidden from assistive tech', async ({ page }) => {
  await seed(page, { count: 2 })
  await openGym(page, 390, 844)
  await toSets(page)
  const line = dialog(page).getByTestId('gym-progress-line')
  await expect(line).toHaveAttribute('aria-hidden', 'true')
  await expect(line.locator('[data-testid^="gym-progress-seg-"]')).toHaveCount(2)
  const scale = (i: number) => () => dialog(page).getByTestId(`gym-progress-fill-${i}`).evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)
  const track = (i: number) => dialog(page).getByTestId(`gym-progress-seg-${i}`).evaluate(el => getComputedStyle(el).backgroundColor)
  // The exercise being worked has the tinted track.
  expect(await track(0)).not.toBe(await track(1))
  expect(await scale(0)()).toBeCloseTo(0, 2)
  await button(dialog(page), 'Complete Set').click()
  await expect.poll(scale(0)).toBeCloseTo(0.5, 2)
  expect(await scale(1)()).toBeCloseTo(0, 2)
  await expect(dialog(page).getByTestId('gym-clock')).toContainText('1/4 sets')
})

test('the elapsed clock counts up from the session start', async ({ page }) => {
  await seed(page)
  await openGym(page, 390, 844)
  await toSets(page)
  const clock = dialog(page).getByRole('timer')
  await expect(clock).toHaveText(/^\d{2}:\d{2}$/)
  await expect(clock).toHaveAccessibleName(/^Workout time \d{2}:\d{2}$/)
  const first = await clock.textContent()
  await expect.poll(() => clock.textContent(), { timeout: 4000 }).not.toBe(first)
})

test('in Spanish at 360 the top row fits and nothing scrolls sideways @mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lyftr_language', 'es'))
  await seed(page, { names: NAMES })
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/workouts/active')
  const gym = page.getByRole('dialog', { name: 'Entrenamiento' })
  await button(gym, 'Empezar entrenamiento').click()
  await button(gym, 'Empezar ejercicio').click()
  await expect(button(gym, 'Completar serie')).toBeVisible()
  await expect(gym.getByTestId('gym-exercise-switcher')).toHaveAccessibleName('Ejercicios, 1 de 3, Bench Press, pecho, 0/2 series completadas')
  await expect(gym.getByTestId('gym-clock')).toContainText('0/6 series')
  expect(await noHorizontalScroll(page)).toBe(true)
  await barFits(page, { minimize: 'Minimizar', more: 'Más opciones', finish: 'Terminar' })
  // The clock column is the only thing that gives way, and the set count under it is not clipped.
  const sets = gym.getByTestId('gym-clock').getByText('0/6 series')
  expect(await sets.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

  await button(gym, 'Más opciones').click()
  await expect(page.getByRole('menuitem')).toHaveText(['Agregar ejercicio', 'Reordenar ejercicios', 'Todos los ejercicios', 'Resumen del entrenamiento', 'Descartar entrenamiento'])
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.keyboard.press('Escape')

  await gym.getByTestId('gym-exercise-switcher').click()
  await expect(page.getByRole('dialog', { name: 'Ejercicios' })).toBeVisible()
  expect(await noHorizontalScroll(page)).toBe(true)
  const { violations } = await new AxeBuilder({ page })
    // The sheet alone: the gym dialog under it keeps aria-modal while a second RN-web Modal is
    // stacked on it, which axe flags whatever the sheet (the discard confirmation too).
    .include(SHEET_DIALOG)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
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
  await button(dialog(page), 'More options').click()
  await page.getByRole('menuitem', { name: 'Discard workout' }).click()
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
      .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
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
