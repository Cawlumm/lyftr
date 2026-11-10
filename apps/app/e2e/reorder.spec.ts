import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// #166: reorder the exercises of a saved workout and of a running session, by button, by
// keyboard and by dragging a row (mouse and touch), and check the order is what gets saved.
const WORKOUT_NAME = 'E2E Reorder Workout'
const LONG_NAME = 'E2E Reorder Long'
const SUPERSET_NAME = 'E2E Reorder Superset'
const SESSION_KEY = 'lyftr_active_session'
const LAYOUT_KEY = 'lyftr_workout_layout'

type Ex = { id: number; name: string }

let token: string
let exercises: Ex[]
let workoutId: number

const ours = (w: { name: string }) => w.name === WORKOUT_NAME || w.name === SUPERSET_NAME

// The sheet's rows in order, read off each row's "Move … up" button.
async function sheetOrder(sheet: Locator): Promise<string[]> {
  const labels = await sheet.getByRole('button', { name: /^Move .* up$/ }).evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label') ?? ''),
  )
  return labels.map((l) => l.replace(/^Move (.*) up$/, '$1'))
}

async function rowName(sheet: Locator, i: number): Promise<string> {
  return (await sheetOrder(sheet))[i]
}

// A finger on the screen. Chromium gets real touches through CDP, so the browser's own
// scrolling takes part exactly as on a phone. WebKit has no such channel and will not
// construct a Touch from script, so it gets touch-typed events carrying the touch lists
// react-native-web reads: the same responder code runs, but the browser cannot scroll.
async function touchDrag(page: Page, x: number, y: number, dy: number, holdMs: number) {
  const steps = 10
  if (page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    const at = (yy: number) => [{ x, y: yy, id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(y) })
    await page.waitForTimeout(holdMs)
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(y + (dy * i) / steps) })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    return
  }
  const fire = (type: string, yy: number) => page.evaluate(({ type, x, yy }) => {
    const w = window as unknown as { __touchTarget?: Element }
    if (type === 'touchstart') w.__touchTarget = document.elementFromPoint(x, yy)!
    const target = w.__touchTarget!
    const touch = { identifier: 1, target, clientX: x, clientY: yy, pageX: x, pageY: yy, force: 1 }
    const live = type === 'touchend' ? [] : [touch]
    const e = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(e, { touches: { value: live }, targetTouches: { value: live }, changedTouches: { value: [touch] } })
    target.dispatchEvent(e)
  }, { type, x, yy })
  await fire('touchstart', y)
  await page.waitForTimeout(holdMs)
  for (let i = 1; i <= steps; i++) {
    await fire('touchmove', y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  await fire('touchend', y + dy)
}

// One way in per screen: a single button beside "Add exercise", none on the cards.
async function openSheet(page: Page): Promise<Locator> {
  const entry = page.getByRole('button', { name: 'Reorder exercises' })
  await expect(entry).toHaveCount(1)
  await entry.click()
  const sheet = page.getByRole('dialog', { name: 'Reorder exercises' })
  await expect(sheet).toBeVisible()
  return sheet
}

// Drags a row by whole rows with the mouse (52px row + 6px gap), by its grip or, since the
// whole row drags, by the exercise name in the middle of it.
async function dragRow(page: Page, sheet: Locator, from: number, rows: number, by: 'grip' | 'body' = 'grip') {
  const target = by === 'grip'
    ? sheet.getByTestId(`reorder-handle-${from}`)
    : sheet.getByTestId(`reorder-body-${from}`).getByText(await rowName(sheet, from), { exact: true })
  const box = (await target.boundingBox())!
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

    // Drag: the last row's grip, two rows up.
    await dragRow(page, sheet, 2, -2)
    expect(await sheetOrder(sheet)).toEqual([a, c, b])
    // And by the body of the row, nowhere near the grip: down one, then back.
    await dragRow(page, sheet, 0, 1, 'body')
    expect(await sheetOrder(sheet)).toEqual([c, a, b])
    await dragRow(page, sheet, 1, -1, 'body')
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

  // Supersets (#227): a move inside the run keeps it; a move that takes a member out dissolves it.
  test('moving a superset member out of its run unlinks it, says so, and saves that', async ({ page, request }) => {
    const headers = { Authorization: `Bearer ${token}` }
    const [a, b, c] = exercises.map((e) => e.name)
    const r = await request.post(`${API}/workouts`, {
      headers,
      data: {
        name: SUPERSET_NAME, duration: 1800, started_at: new Date().toISOString(),
        exercises: exercises.map((e, i) => ({
          exercise_id: e.id, rest_seconds: 60, superset_group: i < 2 ? 1 : null,
          sets: [{ set_number: 1, reps: 10, weight: 100 }],
        })),
      },
    })
    const id = (await r.json()).data.id
    const groups = async () => (await (await request.get(`${API}/workouts/${id}`, { headers })).json()).data.exercises
      .map((e: { superset_group: number | null }) => e.superset_group)
    expect((await groups())[0]).not.toBeNull()

    await page.goto(`/workouts/${id}/edit`)
    await expect(page.getByRole('group', { name: /^Superset A, 2 exercises/ })).toBeVisible()
    const sheet = await openSheet(page)

    await sheet.getByRole('button', { name: `Move ${a} down` }).click()
    expect(await sheetOrder(sheet)).toEqual([b, a, c])
    await expect(sheet.locator('[aria-live="polite"]')).toHaveText(`${a} moved to position 2 of 3`)

    await sheet.getByRole('button', { name: `Move ${a} down` }).click()
    expect(await sheetOrder(sheet)).toEqual([b, c, a])
    await expect(sheet.locator('[aria-live="polite"]')).toHaveText(`${a} moved to position 3 of 3 and unlinked from its superset`)

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('group', { name: /^Superset/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForURL('**/workouts')
    expect(await groups()).toEqual([null, null, null])
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


// A long workout: more rows than the sheet shows, so reaching the end takes the autoscroll,
// and a swipe on the list has to stay a scroll rather than lift a row.
test.describe('Reorder a long workout (#166)', () => {
  const ourLong = (w: { name: string }) => w.name === LONG_NAME
  let longId: number
  let names: string[]

  test.beforeAll(async ({ request, workerAuth }) => {
    token = workerAuth.token
    const headers = { Authorization: `Bearer ${token}` }
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ourLong)
    const list: Ex[] = (await (await request.get(`${API}/exercises?limit=14`, { headers })).json()).data
      .map((e: Ex) => ({ id: e.id, name: e.name }))
    expect(list).toHaveLength(14)
    names = list.map((e) => e.name)
    const r = await request.post(`${API}/workouts`, {
      headers,
      data: {
        name: LONG_NAME,
        duration: 1800,
        started_at: new Date().toISOString(),
        exercises: list.map((e) => ({ exercise_id: e.id, rest_seconds: 90, sets: [{ set_number: 1, reps: 5, weight: 100 }] })),
      },
    })
    longId = (await r.json()).data.id
  })

  test.afterAll(async ({ request }) => {
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ourLong)
  })

  test('scrolls the list while a row is held at its edge, so it can go to the end', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/workouts/${longId}/edit`)
    const sheet = await openSheet(page)
    const list = sheet.getByTestId('reorder-list')
    const scrollTop = () => list.evaluate((el) => el.scrollTop)
    const listBox = (await list.boundingBox())!
    const row = (await sheet.getByTestId('reorder-body-0').getByText(names[0], { exact: true }).boundingBox())!
    // The last row starts out of sight.
    await expect(sheet.getByTestId('reorder-row-13')).not.toBeInViewport()
    expect(await scrollTop()).toBe(0)

    const x = row.x + row.width / 2
    const y0 = row.y + row.height / 2
    const edge = listBox.y + listBox.height - 4
    await page.mouse.move(x, y0)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y0 + ((edge - y0) * i) / 10)
    // Held still at the bottom edge, the list keeps scrolling to its end on its own.
    await expect.poll(scrollTop).toBeGreaterThan(100)
    // (scrollHeight would count the held row's own transform, so measure by the rows.)
    await expect.poll(scrollTop).toBeGreaterThanOrEqual(14 * 58 - Math.round(listBox.height) - 1)
    await expect(sheet.getByTestId('reorder-row-13')).toBeInViewport()
    await page.mouse.up()
    expect(await sheetOrder(sheet)).toEqual([...names.slice(1), names[0]])
  })

  test('on touch, a swipe scrolls the list and a long press drags a row @mobile', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/workouts/${longId}/edit`)
    const sheet = await openSheet(page)
    const list = sheet.getByTestId('reorder-list')
    const body = async (i: number) => (await sheet.getByTestId(`reorder-body-${i}`).getByText(names[i], { exact: true }).boundingBox())!

    // A swipe that starts on a row, with no hold: nothing lifts, and with real touches the
    // list scrolls under it.
    const b2 = await body(2)
    await touchDrag(page, b2.x + b2.width / 2, b2.y + b2.height / 2, -150, 0)
    expect(await sheetOrder(sheet)).toEqual(names)
    if (browserName === 'chromium') await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await list.evaluate((el) => { el.scrollTop = 0 })

    // A short hold lifts the row, and the drag moves it without scrolling the list.
    const b1 = await body(1)
    await touchDrag(page, b1.x + b1.width / 2, b1.y + b1.height / 2, 2 * 58, 400)
    const moved = [names[0], names[2], names[3], names[1], ...names.slice(4)]
    await expect.poll(() => sheetOrder(sheet)).toEqual(moved)
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0)

    // The arrows still take a press after a drag.
    await sheet.getByRole('button', { name: `Move ${names[1]} up` }).click()
    expect(await sheetOrder(sheet)).toEqual([names[0], names[2], names[1], names[3], ...names.slice(4)])
  })
})
