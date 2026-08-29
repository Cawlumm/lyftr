import { test, expect } from './fixtures'
import { corruptStorage } from './faults'

// Three ways the app went blank, each found by driving the running app rather than by
// reading it. A white screen is the least visible failure this app can have: no nav, no
// error, and nothing to click — the only way out is a manual reload, and on mobile there
// is not even that.
//
// These are e2e and not unit tests on purpose. The shapes themselves are pinned in
// workoutSession.test.ts; what cannot be asserted below the browser is that the app still
// *boots* and still draws its chrome, which is the whole claim.

test.describe('The app does not go blank', () => {
  // Signed in there was no catch-all route at all — only the signed-OUT branch had one —
  // so any unknown path matched nothing and React Router rendered nothing. A stale
  // bookmark or a typo was enough.
  for (const path of ['/nonsense-route', '/a/b/c', '/workouts/741/nope']) {
    test(`an unknown URL (${path}) lands somewhere real`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('nav')).toBeVisible()
      expect(page.url()).not.toContain(path)
    })
  }

  // hydrate() wrapped only JSON.parse, so valid JSON of the wrong shape parsed clean and
  // then killed the first consumer to walk it. A user cannot clear their own localStorage,
  // so this was unrecoverable from inside the app.
  const CORRUPT = [
    ['a bare string', '"hello"'],
    ['an array', '[1,2,3]'],
    ['an object with no exercises', '{"name":"X"}'],
    ['exercises explicitly null', '{"name":"X","exercises":null}'],
    ['exercises holding non-objects', '{"name":"X","exercises":[1,2]}'],
    ['malformed json', '{{{not json'],
  ] as const

  for (const [label, value] of CORRUPT) {
    test(`a stored session that is ${label} still boots`, async ({ page }) => {
      await corruptStorage(page, 'lyftr_active_session', value)
      await page.goto('/')

      await expect(page.locator('nav')).toBeVisible()
      // and the unreadable value is swept, so the next boot is clean rather than
      // re-parsing the same corrupt blob forever
      await expect
        .poll(() => page.evaluate(() => window.localStorage.getItem('lyftr_active_session')))
        .toBeNull()
    })
  }
})
