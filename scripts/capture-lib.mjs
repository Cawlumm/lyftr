// Shared by capture-screenshots.mjs and capture-video.mjs: the viewports both record at,
// the API calls both make, and the sign-in and top-up both depend on.

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

export function createApi(base) {
  return async function api(path, { token, method = 'GET', body } = {}) {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return (await res.json()).data
  }
}

export async function connect(api, { email, password }) {
  const token = (await api('auth/login', { method: 'POST', body: { email, password } })).token
  const [program] = await api('programs', { token })
  if (!program) throw new Error('No program on this account: is the backend running with DEMO_MODE=true?')
  return { token, program }
}

export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The demo seed stops three days before the account was created, so on most days "This
// week" reads 0 sessions. This logs program sessions for the days of the current week
// before today, from the routine's own targets, and skips any day that already has one.
// It writes to the account: never point it at one whose data you care about.
export async function topUp(api, { token, program }) {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const recent = await api('workouts?limit=20', { token })
  const logged = new Set(recent.map((w) => isoDay(new Date(w.started_at))))
  const days = program.days.filter((d) => !d.is_rest_day)
  let i = 0
  for (let d = new Date(monday); isoDay(d) < isoDay(now); d.setDate(d.getDate() + 1)) {
    if (logged.has(isoDay(d))) continue
    const day = days[i++ % days.length]
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0)
    await api('workouts', {
      token,
      method: 'POST',
      body: {
        name: day.name,
        duration: 60 * 60 + i * 240,
        started_at: start.toISOString(),
        tz_offset_minutes: -start.getTimezoneOffset(),
        program_id: program.id,
        program_day_id: day.id,
        exercises: day.exercises.map((e, order) => ({
          exercise_id: e.exercise_id,
          order_index: order,
          rest_seconds: e.rest_seconds,
          sets: e.sets.map((s) => ({ set_number: s.set_number, reps: s.target_reps, weight: s.target_weight, program_set_id: s.id })),
        })),
      },
    })
    console.log(`top-up: logged ${day.name} on ${isoDay(d)}`)
  }
}

// A fresh context per take, seeded with theme and workout layout before the app boots.
export async function newSignedInPage(browser, { base, form, theme = 'light', layout = 'list', email, password, contextOptions = {} }) {
  const ctx = await browser.newContext({ ...VIEWPORTS[form], locale: 'en-US', ...contextOptions })
  await ctx.addInitScript(([t, l]) => {
    localStorage.setItem('theme', t)
    localStorage.setItem('lyftr_workout_layout', l)
  }, [theme, layout])
  const page = await ctx.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(String(e)))
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  return { ctx, page, problems }
}
