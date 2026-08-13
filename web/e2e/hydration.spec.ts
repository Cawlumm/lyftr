import { test, expect } from './fixtures'

// The auth store moved from a synchronous localStorage read at module init to the
// shared factory, which starts unauthenticated and hydrates. That is safe ONLY because
// main.tsx awaits hydrateStores() before the first render.
//
// If it ever renders first, App.tsx's catch-all — <Route path="*" element={<Navigate
// to="/login" />} /> — matches while isAuthenticated is still false. <Navigate> performs
// a history REPLACE, so the URL the user arrived on is not just hidden, it is gone:
// back does not recover it. A deep link, an emailed link, or a refresh mid-workout
// would all land on /login with no way back.
//
// Scope, honestly: these assert the user-visible OUTCOME — the URL survives a cold
// reload. They do not currently discriminate against a render-first main.tsx, because
// localStorage settles within a microtask and React's first commit loses that race
// either way. Verified by breaking the gate and watching all five still pass.
//
// So the gate makes that ordering guaranteed rather than incidental, and the test that
// actually catches auth being dropped from the hydrate set is
// src/lib/lyftr.test.ts. These earn their place by covering the case that ordering
// argument does NOT cover: any future hydration that is genuinely async — a network
// call, IndexedDB, a slower adapter — where the race becomes real.

const deepLinks = ['/settings', '/weight', '/food', '/programs']

for (const path of deepLinks) {
  test(`deep link ${path} survives a hard reload (auth hydration gate)`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))

    // A full document reload — the cold-start path where hydration races the router.
    await page.reload({ waitUntil: 'networkidle' })

    await expect(page).toHaveURL(new RegExp(`${path}$`))
    // And we are genuinely on the app, not a login screen that happens to sit at the URL.
    await expect(page.locator('#root')).not.toContainText('Sign in')
  })
}

test('a dynamic deep link survives a hard reload', async ({ page, workerAuth }) => {
  // The realistic loss: someone reopens a specific workout, not a tab route.
  // Navigate first — a relative fetch from about:blank has no origin to resolve against.
  await page.goto('/')
  const id = await page.evaluate(async (token) => {
    const res = await fetch('/api/v1/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'E2E Hydration Probe',
        started_at: new Date().toISOString(),
        duration: 600,
        exercises: [],
      }),
    })
    return (await res.json()).data?.id as number
  }, workerAuth.token)

  expect(id).toBeTruthy()
  const path = `/workouts/${id}`

  await page.goto(path)
  await expect(page).toHaveURL(new RegExp(`${path}$`))

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.locator('#root')).toContainText('E2E Hydration Probe')

  await page.evaluate(async ({ token, id }) => {
    await fetch(`/api/v1/workouts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  }, { token: workerAuth.token, id })
})
