import { test, expect } from './fixtures'

// Icon-only controls had no accessible name: a screen reader announced "button", and
// nothing else. The fix is one attribute per control, which is the kind of change that
// rots silently — nobody notices a missing aria-label by looking at the screen.
//
// So the names are asserted by ROLE here rather than by CSS or position. That is what
// makes them load-bearing: delete an aria-label and this fails, which is the only way a
// label stays correct over time.
test.describe('Icon-only controls have accessible names', () => {
  const BACK_ON = ['/workouts/new', '/programs/new', '/food/log', '/workout/start']

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

    await expect(page.getByRole('button', { name: 'Remove exercise' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove set' }).first()).toBeVisible()
  })
})
