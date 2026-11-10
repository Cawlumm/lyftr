import { test, expect } from './fixtures'
import { gateway, revoked, countRequests, corruptStorage } from './faults'
import { API_BASE } from './config'

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
    await expect(page.getByRole('navigation')).toBeVisible()
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
    // onAuthFailure calls useAuthStore.logout(), which clears the tokens and flips
    // isAuthenticated; the layout gate then routes to /login client-side (no reload).
    // So wait on what the user ends up looking at, then poll the token rather than
    // reading it once - the gate's redirect and the storage clear are separate steps.
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    expect(page.url()).toContain('/login')
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('access_token')))
      .toBeFalsy()
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
    await expect(page.getByRole('navigation')).toBeVisible()

    expect(refreshes()).toBeLessThanOrEqual(1)
  })
})

// The Expo app's web build cannot hold a screen wake lock over plain HTTP (navigator.wakeLock
// is undefined outside a secure context), so it says so once per session instead of
// silently letting the screen sleep mid-workout. Playwright's localhost is a secure context,
// so the insecure case is simulated by removing the API before the app boots.
test.describe('Keeping the screen awake during a workout', () => {
  const SESSION = JSON.stringify({ name: 'E2E Keep Awake', started_at: new Date().toISOString(), exercises: [] })

  test('warns when the page cannot hold a wake lock (plain HTTP)', async ({ page }) => {
    await corruptStorage(page, 'lyftr_active_session', SESSION)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
    })
    await page.goto('/')

    const warning = page.getByRole('alert').filter({ hasText: /open lyftr over https/i })
    await expect(warning).toBeVisible()

    await warning.getByRole('button', { name: /dismiss/i }).click()
    await expect(warning).toBeHidden()
  })

  test('stays quiet when the wake lock is available', async ({ page }) => {
    await corruptStorage(page, 'lyftr_active_session', SESSION)
    await page.goto('/')

    await expect(page.getByRole('navigation')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: /open lyftr over https/i })).toHaveCount(0)
  })
})

// Supersets (#227): the group is part of the persisted session, so a reload keeps the link.
test.describe('A grouped session', () => {
  test('survives a reload still linked, as one superset block', async ({ page, request, workerAuth }) => {
    const exercise = (await (await request.get(`${API_BASE}/exercises?limit=1`, { headers: { Authorization: `Bearer ${workerAuth.token}` } })).json()).data[0].id
    const member = (name: string) => ({
      exercise_id: exercise,
      exercise: { id: exercise, name, muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
      notes: '', rest_seconds: 60, superset_group: 1,
      sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }],
    })
    const session = { name: 'E2E Grouped Session', started_at: new Date().toISOString(), exercises: [member('Bench Press'), member('Barbell Row')] }
    await page.addInitScript((s) => {
      if (localStorage.getItem('lyftr_active_session')) return
      localStorage.setItem('lyftr_active_session', JSON.stringify(s))
      localStorage.setItem('lyftr_workout_layout', 'list')
    }, session)

    await page.goto('/workouts/active')
    const block = page.getByRole('group', { name: /^Superset A, 2 exercises/ })
    await expect(block).toBeVisible()
    await expect(block.getByRole('img', { name: 'Straight to Barbell Row, no rest' })).toBeVisible()

    await page.reload()
    await expect(block).toBeVisible()
    await expect(block.getByRole('img', { name: 'Straight to Barbell Row, no rest' })).toBeVisible()
    const groups = await page.evaluate(() => JSON.parse(localStorage.getItem('lyftr_active_session')!).exercises.map((e: { superset_group: number | null }) => e.superset_group))
    expect(groups).toEqual([1, 1])
  })
})
