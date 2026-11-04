import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// #166: reorder the exercises of a saved workout and of a running session, by button, by
// keyboard and by dragging the handle, and check the order is what gets saved.
const WORKOUT_NAME = 'E2E Reorder Workout'
const SESSION_KEY = 'lyftr_active_session'
const LAYOUT_KEY = 'lyftr_workout_layout'

type Ex = { id: number; name: string }

let token: string
let exercises: Ex[]
let workoutId: number

const ours = (w: { name: string }) => w.name === WORKOUT_NAME

// The sheet's rows in order, read off each row's "Move … up" button.
async function sheetOrder(sheet: Locator): Promise<string[]> {
  const labels = await sheet.getByRole('button', { name: /^Move .* up$/ }).evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label') ?? ''),
  )
  return labels.map((l) => l.replace(/^Move (.*) up$/, '$1'))
}

async function openSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Reorder exercises' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Reorder exercises' })
  await expect(sheet).toBeVisible()
  return sheet
}

// Drags a row's handle by whole rows with the mouse (52px row + 6px gap).
async function dragRow(page: Page, sheet: Locator, from: number, rows: number) {
  const box = (await sheet.getByTestId(`reorder-handle-${from}`).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) await page.mouse.move(x, y + (rows * 58 * i) / steps)
  await page.mouse.up()
}

test.describe('Reorder exercises (#166)', () => {
  test.beforeAll(async ({ request, workerAuth }) => {
    token = workerAuth.token
    const headers = { Authorization: `Bearer ${token}` }
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ours)
    exercises = (await (await request.get(`${API}/exercises?limit=3`, { headers })).json()).data
      .map((e: Ex) => ({ id: e.id, name: e.name }))
    expect(exercises).toHaveLength(3)
    // Each exercise gets a different rep count, so the sets can be told apart after the move.
    const r = await request.post(`${API}/workouts`, {
      headers,
      data: {
        name: WORKOUT_NAME,
        duration: 1800,
        started_at: new Date().toISOString(),
        exercises: exercises.map((e, i) => ({
          exercise_id: e.id, notes: `note ${i}`, rest_seconds: 90,
          sets: [{ set_number: 1, reps: 10 + i, weight: 100 }],
        })),
      },
    })
    workoutId = (await r.json()).data.id
  })

  test.afterAll(async ({ request }) => {
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ours)
  })

  test('reorders a saved workout by button, keyboard and drag, and saves that order', async ({ page, request }) => {
    const [a, b, c] = exercises.map((e) => e.name)
    await page.goto(`/workouts/${workoutId}/edit`)
    const sheet = await openSheet(page)
    expect(await sheetOrder(sheet)).toEqual([a, b, c])

    // Pointer: one press, one place.
    await sheet.getByRole('button', { name: `Move ${b} up` }).click()
    expect(await sheetOrder(sheet)).toEqual([b, a, c])
    await expect(sheet.locator('[aria-live="polite"]')).toHaveText(`${b} moved to position 1 of 3`)

    // Keyboard: focus stays on the control that moved, and hands over to its twin at the top.
    const cUp = sheet.getByRole('button', { name: `Move ${c} up` })
    await cUp.focus()
    await page.keyboard.press('Enter')
    expect(await sheetOrder(sheet)).toEqual([b, c, a])
    await expect(cUp).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await sheetOrder(sheet)).toEqual([c, b, a])
    await expect(sheet.getByRole('button', { name: `Move ${c} down` })).toBeFocused()
    await expect(cUp).toBeDisabled()

    // Drag: the last row's handle, two rows up.
    await dragRow(page, sheet, 2, -2)
    expect(await sheetOrder(sheet)).toEqual([a, c, b])

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForURL('**/workouts')

    // Saved in the new order, each exercise still carrying its own note and sets.
    const saved = (await (await request.get(`${API}/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()).data
    expect(saved.exercises.map((e: { exercise_id: number }) => e.exercise_id)).toEqual([exercises[0].id, exercises[2].id, exercises[1].id])
    expect(saved.exercises.map((e: { notes: string }) => e.notes)).toEqual(['note 0', 'note 2', 'note 1'])
    expect(saved.exercises.map((e: { sets: { reps: number }[] }) => e.sets[0].reps)).toEqual([10, 12, 11])

    // And a fresh load shows it.
    await page.goto(`/workouts/${workoutId}/edit`)
    expect(await sheetOrder(await openSheet(page))).toEqual([a, c, b])
  })

  test('reorders a running session at phone width, and the order survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const [a, b] = exercises
    const ex = (e: Ex, completed: boolean) => ({
      exercise_id: e.id,
      exercise: { id: e.id, name: e.name, muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
      notes: '', rest_seconds: 90,
      sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed }],
    })
    await page.addInitScript(({ sk, lk, s }: { sk: string; lk: string; s: unknown }) => {
      if (localStorage.getItem(sk)) return
      localStorage.setItem(sk, JSON.stringify(s))
      localStorage.setItem(lk, 'list')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: { name: 'E2E Reorder Session', started_at: new Date().toISOString(), exercises: [ex(a, true), ex(b, false)] } })

    await page.goto('/workouts/active')
    const sheet = await openSheet(page)
    await sheet.getByRole('button', { name: `Move ${a.name} down` }).click()
    expect(await sheetOrder(sheet)).toEqual([b.name, a.name])
    await sheet.getByRole('button', { name: 'Done' }).click()

    const stored = async () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SESSION_KEY)
    const s1 = await stored()
    expect(s1.exercises.map((e: { exercise_id: number }) => e.exercise_id)).toEqual([b.id, a.id])
    // The completed set went with its exercise.
    expect(s1.exercises[1].sets[0].completed).toBe(true)

    await page.reload()
    expect(await sheetOrder(await openSheet(page))).toEqual([b.name, a.name])
    await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY)
  })

  // react-native-web reports onLayout only on resize, so a card that only moved never re-reports
  // where it is: the jump must still land on the exercise, not on its old slot.
  test('jumping to an exercise after a reorder scrolls to that exercise', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const [a, b, c] = exercises
    const ex = (e: Ex, sets: number) => ({
      exercise_id: e.id,
      exercise: { id: e.id, name: e.name, muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
      notes: '', rest_seconds: 90,
      sets: Array.from({ length: sets }, (_, i) => ({ set_number: i + 1, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: false })),
    })
    await page.addInitScript(({ sk, lk, s }: { sk: string; lk: string; s: unknown }) => {
      if (localStorage.getItem(sk)) return
      localStorage.setItem(sk, JSON.stringify(s))
      localStorage.setItem(lk, 'list')
    }, { sk: SESSION_KEY, lk: LAYOUT_KEY, s: { name: 'E2E Reorder Jump', started_at: new Date().toISOString(), exercises: [ex(a, 6), ex(b, 2), ex(c, 3)] } })

    await page.goto('/workouts/active')
    const sheet = await openSheet(page)
    await dragRow(page, sheet, 0, 2)
    expect(await sheetOrder(sheet)).toEqual([b.name, c.name, a.name])
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()

    // The step pills: the second is now C.
    await page.getByRole('button', { name: c.name }).first().click()
    const title = page.getByText(c.name, { exact: true }).last()
    await expect.poll(async () => (await title.boundingBox())?.y ?? -1).toBeGreaterThan(150)
    await expect.poll(async () => (await title.boundingBox())?.y ?? 9999).toBeLessThan(400)
    await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY)
  })
})
