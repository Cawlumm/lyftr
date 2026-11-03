import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'

// Ports web/e2e/a11y.spec.ts test for test. Icon-only controls had no accessible name: a
// screen reader announced "button", and nothing else. The fix is one attribute per control,
// which is the kind of change that rots silently.
//
// So the names are asserted by ROLE here rather than by CSS or position. That is what
// makes them load-bearing: delete an accessibilityLabel and this fails.
//
// The axe scans at the bottom are new here (the Vite suite had none): @axe-core/playwright is
// approved for this migration, and they hold the structure rules (names, roles, landmarks,
// ARIA validity) at zero violations on the screens that carry the app.
//
// The paths are the Expo app's own: /workout/start and /food/log are the old URLs, which
// redirect to /workouts/start and /nutrition/log, so those are asserted directly.
test.describe('Icon-only controls have accessible names', () => {
  const BACK_ON = ['/workouts/new', '/programs/new', '/nutrition/log', '/workouts/start']

  for (const path of BACK_ON) {
    test(`${path} names its back button`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible()
    })
  }

  // The destructive ones matter most: a control that removes a set or an exercise is the
  // worst thing to announce as an unnamed "button".
  test('the workout form names its destructive controls', async ({ page }) => {
    await page.goto('/workouts/new')

    await page.getByRole('button', { name: /add exercise/i }).click()
    await page.getByPlaceholder(/search exercises/i).fill('bench press')
    await page.getByText(/bench press/i).first().click()

    // The Expo card names the exercise it removes ("Remove Bench Press with Chains"), which
    // is more specific than the Vite page's generic "Remove exercise".
    await expect(page.getByRole('button', { name: /^remove .*bench press/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove set' }).first()).toBeVisible()
  })
})

// WCAG 2.x A/AA and 2.2 AA, minus colour contrast: text-tx-muted and the auth labels measure
// below 4.5:1 today, which is a palette change tracked by the test.fixme below rather than
// something to switch off silently. Everything else must be clean.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function violations(page: import('@playwright/test').Page, rules: { disable?: string[] } = {}) {
  await page.waitForLoadState('networkidle')
  let axe = new AxeBuilder({ page }).withTags(WCAG)
  if (rules.disable) axe = axe.disableRules(rules.disable)
  const { violations } = await axe.analyze()
  return violations.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)
}

test.describe('axe: no structural violations', () => {
  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    for (const path of ['/login', '/register']) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path)
        expect(await violations(page, { disable: ['color-contrast'] })).toEqual([])
      })
    }
  })

  for (const path of ['/', '/workouts', '/settings', '/settings/password']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path)
      expect(await violations(page, { disable: ['color-contrast'] })).toEqual([])
    })
  }
})

// The same scan with contrast on fails across the app (muted text on every screen), which
// wants a design/token pass, not a spec edit.
test.fixme('axe: colour contrast meets WCAG AA', async ({ page }) => {
  await page.goto('/')
  expect(await violations(page, {})).toEqual([])
})
