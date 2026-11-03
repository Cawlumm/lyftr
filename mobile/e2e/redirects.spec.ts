import { test, expect } from '@playwright/test'
import { LEGACY_ROUTES } from '../src/lib/legacyRoutes'

// nginx's half of the cut-over (C35): every old Vite URL is a 301 straight to its new path,
// with the query string intact, before any JS loads. The rules are generated from
// LEGACY_ROUTES (mobile/nginx.legacy-redirects.conf); this drives each one through the
// image, so a rule nginx rejects or orders behind another location fails here. Not
// followed: a 200 would mean the SPA fallback answered and only the client redirected.
const SAMPLE_PARAM = '42'
const QUERY = '?edit=1&note=a%20b'

const sample = (pattern: string) => pattern.replace(/:\w+/g, SAMPLE_PARAM)

for (const { from, to } of LEGACY_ROUTES) {
  test(`${from} is a 301 to ${to} with the query kept`, async ({ request }) => {
    const res = await request.get(sample(from) + QUERY, { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    // Relative, like the change-password 302: an absolute one would be built from the
    // http scheme nginx sees behind the TLS terminator.
    expect(res.headers()['location']).toBe(sample(to) + QUERY)
  })
}

test('a legacy URL without a query gets no stray "?"', async ({ request }) => {
  const res = await request.get('/food/log', { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(res.headers()['location']).toBe('/nutrition/log')
})

test('a CRLF in a captured id cannot inject a header', async ({ request }) => {
  const res = await request.get('/exercises/1%0d%0aX-Injected:%201', { maxRedirects: 0 })
  expect(res.headers()['x-injected']).toBeUndefined()
  expect(res.status()).not.toBe(301)
})

test('a non-numeric id is not redirected by nginx', async ({ request }) => {
  const res = await request.get('/exercises/abc', { maxRedirects: 0 })
  expect(res.status()).not.toBe(301)
})

test('the new paths are served, not redirected', async ({ request }) => {
  for (const { to } of LEGACY_ROUTES) {
    const res = await request.get(sample(to), { maxRedirects: 0 })
    expect(res.status(), sample(to)).toBe(200)
  }
})

test('index.html revalidates and the hashed bundle is immutable', async ({ request }) => {
  const page = await request.get('/workouts')
  expect(page.headers()['cache-control']).toBe('no-cache')
  const bundle = (await page.text()).match(/src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/)?.[1]
  expect(bundle).toBeTruthy()
  const res = await request.get(bundle!)
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})
