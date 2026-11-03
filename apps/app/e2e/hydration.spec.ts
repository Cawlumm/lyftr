import { test, expect } from './fixtures'

// The root layout hydrates the stores from AsyncStorage (localStorage on web) and holds the
// app on its loader until auth has settled. If it routed first, the signed-out guard would
// see isAuthenticated=false and redirect to /login, replacing the history entry: the URL
// the user arrived on would be gone and back would not recover it. A deep link, an emailed
// link, or a refresh mid-workout would all land on /login.
//
// These assert the user-visible OUTCOME: the URL survives a cold reload, and the screen
// behind it is the app rather than a login form at the right address.

const deepLinks = ['/settings', '/weight', '/nutrition', '/programs']

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
