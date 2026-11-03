import type { Locator, Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { API_BASE } from './config'
import { cleanupSeed } from './seedHelpers'
import { WIDTH_GROUPS, sweepWidths } from './widths'

// The workout and program detail and form screens on wide web (C29). Each is a centred
// max-w-2xl column. From lg the workout form puts name, date and duration on one row, the
// form actions size to their labels at the right, and the program's days wrap instead of
// scrolling sideways. Exercise cards on the details are real links. Below lg, and on
// native, every screen is the phone's single column.
const WORKOUT = 'E2E Forms Workout'
const PROGRAM = 'E2E Forms Program'
const KEYBOARD_WORKOUT = 'E2E Forms Keyboard'
const SIDEBAR = 240
const MAX_W_2XL = 672

let workoutId: number
let programId: number
let token: string

const ours = (w: { name: string }) => [WORKOUT, KEYBOARD_WORKOUT].includes(w.name)

test.beforeAll(async ({ request, workerAuth }) => {
  token = workerAuth.token
  const headers = { Authorization: `Bearer ${token}` }
  await cleanupSeed(request, token, `${API_BASE}/workouts?limit=1000`, `${API_BASE}/workouts`, ours)
  await cleanupSeed(request, token, `${API_BASE}/programs`, `${API_BASE}/programs`, (p) => p.name === PROGRAM)
  const exercises = (await (await request.get(`${API_BASE}/exercises?limit=2`, { headers })).json()).data
  const sets = [{ set_number: 1, reps: 8, weight: 135 }, { set_number: 2, reps: 8, weight: 135 }]
  const w = await request.post(`${API_BASE}/workouts`, {
    headers,
    data: {
      name: WORKOUT, duration: 3600, started_at: new Date().toISOString(),
      exercises: exercises.map((e: { id: number }, i: number) => ({ exercise_id: e.id, order_index: i, notes: '', rest_seconds: 90, sets })),
    },
  })
  expect(w.ok()).toBeTruthy()
  workoutId = (await w.json()).data.id
  // Eight days, more than fit one row of the 2xl column, so the wide strip has to wrap.
  const days = Array.from({ length: 8 }, (_, i) => ({
    order_index: i, is_rest_day: i === 7, name: `Day ${i + 1}`,
    exercises: i === 7 ? [] : [{ exercise_id: exercises[0].id, notes: '', rest_seconds: 90, sets: [{ set_number: 1, target_reps: 5, target_weight: 100 }] }],
  }))
  const p = await request.post(`${API_BASE}/programs`, { headers, data: { name: PROGRAM, notes: '', days } })
  expect(p.ok()).toBeTruthy()
  programId = (await p.json()).data.id
})

test.afterAll(async ({ request }) => {
  await cleanupSeed(request, token, `${API_BASE}/workouts?limit=1000`, `${API_BASE}/workouts`, ours)
  await cleanupSeed(request, token, `${API_BASE}/programs`, `${API_BASE}/programs`, (p) => p.name === PROGRAM)
})

const screens = () => [
  ['workout-new', '/workouts/new'],
  ['workout-detail', `/workouts/${workoutId}`],
  ['workout-edit', `/workouts/${workoutId}/edit`],
  ['workout-start', '/workouts/start'],
  ['program-new', '/programs/new'],
  ['program-detail', `/programs/${programId}`],
  ['program-edit', `/programs/${programId}/edit`],
] as const

async function open(page: Page, path: string, width: number, height = 800) {
  await page.setViewportSize({ width, height })
  await page.goto(path)
  await expect(main(page)).toBeVisible()
  await page.waitForLoadState('networkidle')
}

// expo-router keeps earlier stack screens mounted but hidden, so only the visible one counts.
const main = (page: Page) => page.getByRole('main').locator('visible=true')
const field = (page: Page, placeholder: string) => page.getByPlaceholder(placeholder).locator('visible=true')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).locator('visible=true')
const box = async (l: Locator) => (await l.boundingBox())!
const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return
  }
  throw new Error('Tab never reached the target')
}

// The form's own scroller: the nearest ancestor of the name field that scrolls.
const scrollTop = (page: Page) => field(page, 'e.g., Leg Day, Push Day').evaluate((el) => {
  for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n.scrollTop
  }
  return -1
})

for (const widths of WIDTH_GROUPS) {
  test(`detail and form screens do not scroll horizontally at ${widths.join('/')}px`, async ({ page }, testInfo) => {
    for (const [name, path] of screens()) {
      await open(page, path, widths[0])
      await sweepWidths(page, testInfo, name, widths, { shoot: [390, 1280, 1920], height: 800 })
    }
  })
}

test('at 1280 every screen is a centred column no wider than max-w-2xl', async ({ page }) => {
  const centre = SIDEBAR + (1280 - SIDEBAR) / 2
  for (const [name, path] of screens()) {
    await open(page, path, 1280)
    const b = await box(main(page))
    expect(b.width, name).toBeLessThanOrEqual(MAX_W_2XL)
    expect(Math.abs(b.x + b.width / 2 - centre), name).toBeLessThanOrEqual(2)
  }
})

test('at 1280 the workout form puts name, date and duration on one row', async ({ page }) => {
  await open(page, '/workouts/new', 1280)
  const name = await box(field(page, 'e.g., Leg Day, Push Day'))
  const date = await box(page.getByLabel('Pick date').locator('visible=true'))
  const duration = await box(page.getByLabel('Duration in minutes').locator('visible=true'))
  // Centres: the duration input sits inside its stepper, the others fill their boxes.
  const mid = (b: { y: number; height: number }) => b.y + b.height / 2
  expect(Math.abs(mid(name) - mid(date))).toBeLessThan(4)
  expect(Math.abs(mid(date) - mid(duration))).toBeLessThan(4)
  expect(name.x).toBeLessThan(date.x)
  expect(date.x).toBeLessThan(duration.x)
})

test('at 1280 the form actions sit at the right, sized to their labels', async ({ page }) => {
  await open(page, '/workouts/new', 1280)
  const column = await box(main(page))
  const cancel = await box(button(page, 'Cancel'))
  const save = await box(button(page, 'Save Workout'))
  expect(Math.abs(cancel.y - save.y)).toBeLessThan(4)
  expect(save.x).toBeGreaterThan(cancel.x)
  expect(Math.abs(save.x + save.width - (column.x + column.width - 20))).toBeLessThanOrEqual(2)
  expect(cancel.width).toBeLessThan(column.width / 3)
})

test('at 390 the form is the phone column: date under the name, actions sharing the row @mobile', async ({ page }) => {
  await open(page, '/workouts/new', 390, 844)
  const name = await box(field(page, 'e.g., Leg Day, Push Day'))
  const date = await box(page.getByLabel('Pick date').locator('visible=true'))
  expect(date.y).toBeGreaterThan(name.y + 30)
  const cancel = await box(button(page, 'Cancel'))
  const save = await box(button(page, 'Save Workout'))
  expect(Math.abs(cancel.width - save.width)).toBeLessThanOrEqual(2)
})

test('at 1280 the program days wrap instead of scrolling sideways', async ({ page }) => {
  await open(page, `/programs/${programId}`, 1280)
  const days = page.getByRole('button', { name: /^Day \d/ }).locator('visible=true')
  await expect(days).toHaveCount(8)
  const column = await box(main(page))
  const tops = new Set<number>()
  for (const d of await days.all()) {
    const b = await box(d)
    expect(b.x + b.width).toBeLessThanOrEqual(column.x + column.width)
    tops.add(Math.round(b.y))
  }
  expect(tops.size).toBeGreaterThan(1)
  await days.nth(2).click()
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'false')
})

test('exercise cards on both details are links to the exercise, and Edit is a link', async ({ page }) => {
  for (const [path, base] of [[`/workouts/${workoutId}`, '/workouts'], [`/programs/${programId}`, '/programs']] as const) {
    await open(page, path, 1280)
    const cards = main(page).locator(`a[href^="${base}/exercise/"]`)
    expect(await cards.count(), path).toBeGreaterThan(0)
    await expect(cards.first()).toHaveAttribute('aria-label', /\S/)
    await expect(main(page).getByRole('link', { name: /^Edit / })).toHaveAttribute('href', `${path}/edit`)
  }
  await open(page, `/workouts/${workoutId}`, 1280)
  const card = main(page).locator('a[href^="/workouts/exercise/"]').first()
  const href = (await card.getAttribute('href'))!
  await card.click()
  await expect(page).toHaveURL(href)
  await page.goBack()
  await expect(page).toHaveURL(`/workouts/${workoutId}`)
})

test('a failed save scrolls the form back to its alert', async ({ page }) => {
  await open(page, '/workouts/new', 1280, 420)
  await page.mouse.move(700, 250)
  await page.mouse.wheel(0, 600)
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0)
  await button(page, 'Save Workout').click()
  await expect(page.getByRole('alert').locator('visible=true')).toHaveText('Workout name required')
  await expect.poll(() => scrollTop(page)).toBe(0)
})

test('keyboard only: create a workout from the name field to Save', async ({ page, request }) => {
  await open(page, '/workouts/new', 1280)
  const name = field(page, 'e.g., Leg Day, Push Day')
  await tabTo(page, name)
  await page.keyboard.type(KEYBOARD_WORKOUT)
  await tabTo(page, page.getByLabel('Duration in minutes').locator('visible=true'))
  await page.keyboard.type('45')
  await tabTo(page, button(page, 'Add Exercise'))
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const search = dialog.getByPlaceholder(/Search exercises/)
  await tabTo(page, search)
  await page.keyboard.type('squat')
  const result = dialog.getByRole('button', { name: /squat/i }).first()
  await expect(result).toBeVisible()
  await tabTo(page, result)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  const reps = page.getByLabel('Set reps').locator('visible=true').first()
  await tabTo(page, reps)
  await page.keyboard.type('5')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Set weight').locator('visible=true').first()).toBeFocused()
  await page.keyboard.type('100')
  await tabTo(page, button(page, 'Save Workout'))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/workouts$/)
  const list = (await (await request.get(`${API_BASE}/workouts?limit=100`, { headers: { Authorization: `Bearer ${token}` } })).json()).data
  const saved = (list.workouts ?? list).find((w: { name: string }) => w.name === KEYBOARD_WORKOUT)
  expect(saved).toBeTruthy()
  expect(saved.duration).toBe(45 * 60)
})

for (const [name, width] of [
  ['workout-new', 1280], ['workout-new', 390], ['workout-detail', 1280], ['workout-edit', 1280],
  ['workout-start', 1280], ['program-new', 1280], ['program-detail', 1280], ['program-edit', 1280],
] as const) {
  test(`axe: ${name} at ${width} has no structural violations`, async ({ page }) => {
    await open(page, screens().find(([n]) => n === name)![1], width)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
      .analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a failed save jumps to the alert instead of scrolling smoothly', async ({ page }) => {
    await open(page, '/workouts/new', 1280, 420)
    await page.mouse.move(700, 250)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0)
    await button(page, 'Save Workout').click()
    await expect(page.getByRole('alert').locator('visible=true')).toBeVisible()
    // No poll: under reduced motion the scroll is instant, so it is already at the top.
    expect(await scrollTop(page)).toBe(0)
  })
})
