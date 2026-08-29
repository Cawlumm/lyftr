import { test, expect } from './fixtures'
import { gateway, revoked, countRequests } from './faults'

// The #145 doctrine, end to end: silence is not a verdict.
//
// The reporter filmed a workout timer ticking beside five taps on a dead button, and it
// took a full restart to clear. Two halves to the fix, and only one of them is unit
// testable in isolation — that a real browser, holding a real session, does not lose it
// when the network fails is a journey, so it lives here.
//
// Why 502 rather than a black hole: REQUEST_TIMEOUT is 20s by design, which is correct for
// a phone on bad wifi and far too slow for a browser test. The timeout path is pinned in
// client.test.ts; this file pins the branch a user actually meets when the box they own is
// restarting — a reverse proxy answering 502 for a few seconds.
//
// Both tests force the same starting point: a data call 401s, so the client attempts a
// refresh. What the *refresh* answers is the only thing that differs, and it decides
// whether the session survives.
test.describe('A failing request does not end the session', () => {
  test('a 502 from the refresh keeps the user signed in', async ({ page }) => {
    await revoked(page, '**/api/v1/workouts**')
    await gateway(page, '**/api/v1/auth/refresh**')

    await page.goto('/workouts')

    // The session is intact: the signed-in chrome is still rendered and we were not
    // bounced to the login screen. Asserting the nav rather than the URL because a URL
    // assertion passes on the first tick and would not catch a redirect that lands late.
    await expect(page.locator('nav')).toBeVisible()
    expect(page.url()).not.toContain('/login')

    const token = await page.evaluate(() => window.localStorage.getItem('access_token'))
    expect(token).toBeTruthy()
  })

  test('a 401 from the refresh signs the user out', async ({ page }) => {
    await revoked(page, '**/api/v1/workouts**')
    await revoked(page, '**/api/v1/auth/refresh**')

    await page.goto('/workouts')

    // The server revoked it — the one answer that may end a session.
    //
    // Waiting on the login screen rather than on the URL: web's onAuthFailure is a hard
    // `location.href = '/login'`, which aborts the navigation still in flight, so
    // waitForURL('**/login') loses the race with net::ERR_ABORTED. A web-first assertion
    // on what the user actually ends up looking at survives the reload.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(page.url()).toContain('/login')
    const token = await page.evaluate(() => window.localStorage.getItem('access_token'))
    expect(token).toBeFalsy()
  })

  test('a burst of 401s shares one refresh round-trip', async ({ page }) => {
    // The dashboard fires several calls at once. Before refreshOnce each one raced to
    // rotate the same token, so the winners invalidated the losers and a page that
    // should have recovered signed the user out instead.
    const refreshes = countRequests(page, '/auth/refresh')
    await revoked(page, '**/api/v1/workouts**')
    await revoked(page, '**/api/v1/food**')
    await revoked(page, '**/api/v1/weight**')
    await gateway(page, '**/api/v1/auth/refresh**')

    await page.goto('/')
    await expect(page.locator('nav')).toBeVisible()

    expect(refreshes()).toBeLessThanOrEqual(1)
  })
})
