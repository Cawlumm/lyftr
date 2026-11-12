import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'
import { cleanupSeed } from './seedHelpers'

// Touch targets: on a phone every control a thumb can land on has a hit box of at least
// 44x44 (Apple HIG 44pt, WCAG 2.2 SC 2.5.5 AAA 44px; Material asks 48dp). The box is the
// element's own bounding box, which is what a tap resolves against on web and native alike,
// so a control smaller than that must have been padded out (interaction.ts, `touchTarget`),
// never merely given a native-only hitSlop.
//
// Two checks per route: no control under 44x44, and no two controls whose boxes overlap, since
// an overlap means a tap between them is ambiguous.
const MIN = 44
const SEED = 'E2E Touch'

// Controls exempt on purpose. Each entry is a regex on "<accessible name> <width>x<height>".
const EXEMPT: RegExp[] = [
  // The two arrows that reorder a program day are 16px glyphs stacked flush: 44 tall each would
  // overlap. Each gets 44 wide x 22 tall instead (see ProgramDaysEditor).
  /^Move day \d+ (up|down) 44x22$/,
  // The "N exercises" bar that opens a day is full width and flush with its card's bottom edge
  // (overflow hidden), so padding it out would be clipped; it keeps its 37px height.
  /^\d+ exercises? \d+x37$/,
  // A platform switch: react-native-web draws the <input> at 2:1 of its 20px height, and there
  // is no way to enlarge its hit box short of enlarging the control itself.
  /^(Dark mode|Rest timer) 40x20$/,
]

// Overlaps that were there before the padding. The day-name input is wider than its column and
// runs under the Remove day button, which is drawn on top of it.
const EXEMPT_OVERLAP: RegExp[] = [/^Remove day \d+-\d+ \/ INPUT \(field\)/]

// tabindex=0 catches the pressables that carry no role (react-native-web renders them as a div).
// The dashboard's consistency heatmap: 7 x 12 cells packed into one card width, each opened to
// read its day. A cell cannot be 44px wide without the grid scrolling sideways.
const HEATMAP = '[data-testid="heatmap-week"]'

const SCAN = `a[href], button, [role=button], [role=link], [role=tab], [role=switch], [tabindex="0"]`

const scan = (page: Page) => page.evaluate(({ sel, min, heatmap }) => {
  const doc = document.documentElement
  const visible = (el: Element) => (el as HTMLElement).checkVisibility({ checkVisibilityCSS: true })
  const els = [...document.querySelectorAll(sel)].filter(visible)
  const name = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const boxes = els.filter((el) => !el.closest(heatmap)).map((el) => ({ el, name: name(el), r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0)
  const small = boxes
    .filter((b) => b.r.width < min - 0.5 || b.r.height < min - 0.5)
    .map((b) => `${b.name} ${Math.round(b.r.width)}x${Math.round(b.r.height)}`)
  const chrome = (el: Element) => {
    for (let p: Element | null = el; p && p !== doc; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.position === 'fixed' || cs.position === 'sticky' || p.matches('nav, [role=tablist]')) return true
    }
    return false
  }
  // The padded box must really answer a tap: the point just inside each edge (a few px in, mid
  // way along) has to land on the control, not on a parent that clips it or a neighbour on top.
  const unreachable: string[] = []
  for (const b of boxes) {
    // A disabled control lets a tap through by design.
    if (b.el.matches('[aria-disabled=true], [disabled]')) continue
    const { left, right, top, bottom } = b.r
    const cx = (left + right) / 2, cy = (top + bottom) / 2
    for (const [x, y] of [[left + 4, cy], [right - 4, cy], [cx, top + 4], [cx, bottom - 4]]) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && !b.el.contains(hit) && !chrome(hit)) { unreachable.push(`${b.name} at ${Math.round(x)},${Math.round(y)} lands on ${hit.tagName.toLowerCase()} ${String(hit.className).slice(0, 60)}`); break }
    }
  }
  // Two targets whose boxes cross make a tap between them ambiguous. Not counted: a box that
  // holds the other (a card with its own menu button on top), a fixed bar over scrolled content,
  // and a sliver of 4px or less, which is two padded boxes meeting across a 4px gap.
  const holds = (a: DOMRect, b: DOMRect) => a.left <= b.left + 1 && a.right >= b.right - 1 && a.top <= b.top + 1 && a.bottom >= b.bottom - 1
  // Text fields take part in the overlap check only: a padded button must not sit over one.
  const fields = [...document.querySelectorAll('input:not([type=hidden]):not([role=switch]), textarea')].filter(visible)
    .map((el) => ({ el, name: `${name(el)} (field)`, r: el.getBoundingClientRect() }))
  const all = [...boxes, ...fields]
  const overlaps: string[] = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], c = all[j]
      if (i >= boxes.length && j >= boxes.length) continue
      if (a.el.contains(c.el) || c.el.contains(a.el) || holds(a.r, c.r) || holds(c.r, a.r) || chrome(a.el) || chrome(c.el)) continue
      const w = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left)
      const h = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top)
      if (w > 4 && h > 4) overlaps.push(`${a.name} ${Math.round(a.r.left)}-${Math.round(a.r.right)} / ${c.name} ${Math.round(c.r.left)}-${Math.round(c.r.right)} (${Math.round(w)}x${Math.round(h)})`)
    }
  }
  return { small, unreachable, overlaps }
}, { sel: SCAN, min: MIN, heatmap: HEATMAP })

async function check(page: Page, path: string) {
  // Tall, so the whole page is on screen and every control can be hit-tested.
  await page.setViewportSize({ width: 390, height: 2400 })
  await page.goto(path)
  await expect(page.getByRole('heading').locator('visible=true').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  const { small, unreachable, overlaps } = await scan(page)
  const keep = (s: string) => !EXEMPT.some((re) => re.test(s))
  expect(small.filter(keep), `${path}: controls under ${MIN}x${MIN}`).toEqual([])
  expect(unreachable, `${path}: part of a hit box does not reach the control`).toEqual([])
  expect(overlaps.filter((s) => !EXEMPT_OVERLAP.some((re) => re.test(s))), `${path}: overlapping hit areas`).toEqual([])
}

let token: string
let workoutId: number
let programId: number
let exerciseId: number
let foodId: number
let weightId: number
let day: string

test.describe('Touch targets are at least 44x44 @mobile', () => {
  test.use({ reducedMotion: 'reduce' })
  const ours = (x: { name: string }) => x.name.startsWith(SEED)

  test.beforeAll(async ({ request, workerAuth }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the phone project only')
    token = workerAuth.token
    const headers = { Authorization: `Bearer ${token}` }
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ours)
    await cleanupSeed(request, token, `${API}/programs`, `${API}/programs`, ours)
    const exercises = (await (await request.get(`${API}/exercises?limit=2`, { headers })).json()).data as { id: number }[]
    expect(exercises.length).toBe(2)
    const now = new Date()
    day = now.toISOString().slice(0, 10)
    exerciseId = exercises[0].id
    const w = await request.post(`${API}/workouts`, {
      headers,
      data: {
        name: `${SEED} Workout`, duration: 1800, started_at: now.toISOString(),
        exercises: exercises.map((e) => ({ exercise_id: e.id, notes: '', rest_seconds: 90, superset_group: 1, sets: [{ set_number: 1, reps: 10, weight: 100 }] })),
      },
    })
    workoutId = (await w.json()).data.id
    const sets = [{ set_number: 1, target_reps: 8, target_weight: 100 }]
    const p = await request.post(`${API}/programs`, {
      headers,
      data: {
        name: `${SEED} Program`, notes: '',
        days: [
          { name: 'Push', is_rest_day: false, exercises: exercises.map((e) => ({ exercise_id: e.id, notes: '', rest_seconds: 90, superset_group: 1, sets })) },
          { name: 'Rest', is_rest_day: true, exercises: [] },
          { name: 'Pull', is_rest_day: false, exercises: [{ exercise_id: exercises[0].id, notes: '', rest_seconds: 90, sets }] },
        ],
      },
    })
    programId = (await p.json()).data.id
    const f = await request.post(`${API}/food`, {
      headers,
      data: { name: `${SEED} Food`, meal: 'lunch', calories: 300, protein: 20, carbs: 30, fat: 10, logged_at: now.toISOString(), logged_on: day },
    })
    expect(f.ok()).toBeTruthy()
    foodId = (await f.json()).data.id
    const wt = await request.post(`${API}/weight`, {
      headers,
      data: { weight: 180, notes: SEED, logged_at: now.toISOString(), logged_on: day },
    })
    expect(wt.ok()).toBeTruthy()
    weightId = (await wt.json()).data.id
  })

  test.afterAll(async ({ request }) => {
    await cleanupSeed(request, token, `${API}/workouts?limit=100`, `${API}/workouts`, ours)
    await cleanupSeed(request, token, `${API}/programs`, `${API}/programs`, ours)
    await cleanupSeed(request, token, `${API}/food?date=${day}`, `${API}/food`, ours)
    await cleanupSeed(request, token, `${API}/weight`, `${API}/weight`, (w: { notes: string }) => w.notes === SEED)
  })

  test('dashboard', async ({ page }) => { await check(page, '/') })
  test('workouts', async ({ page }) => { await check(page, '/workouts') })
  test('workout detail', async ({ page }) => { await check(page, `/workouts/${workoutId}`) })
  test('programs', async ({ page }) => { await check(page, '/programs') })
  test('program detail', async ({ page }) => { await check(page, `/programs/${programId}`) })
  test('program edit', async ({ page }) => { await check(page, `/programs/${programId}/edit`) })
  test('nutrition', async ({ page }) => { await check(page, '/nutrition') })
  test('weight', async ({ page }) => { await check(page, '/weight') })
  test('settings', async ({ page }) => { await check(page, '/settings') })
  test('log workout', async ({ page }) => { await check(page, '/workouts/new') })
  test('edit workout', async ({ page }) => { await check(page, `/workouts/${workoutId}/edit`) })
  test('exercise detail', async ({ page }) => { await check(page, `/workouts/exercise/${exerciseId}`) })
  test('food entry', async ({ page }) => { await check(page, `/nutrition/${foodId}`) })
  test('log food', async ({ page }) => { await check(page, '/nutrition/log') })
  test('weight entry', async ({ page }) => { await check(page, `/weight/${weightId}`) })
})
