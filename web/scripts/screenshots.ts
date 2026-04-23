/**
 * Run: npx tsx scripts/screenshots.ts
 * Requires: dev server on :5173 (npm run dev) with backend on :3000
 * Or pass BASE_URL env var for docker.
 */
import { chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../docs/screenshots')
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const API = process.env.API_URL ?? `${BASE}/api/v1`
const EMAIL = process.env.TEST_EMAIL ?? 'demo@lyftr.local'
const PASSWORD = process.env.TEST_PASSWORD ?? 'password123'

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

const SESSION_KEY = 'lyftr_active_session'
const LAYOUT_KEY = 'lyftr_workout_layout'

async function main() {
  const browser = await chromium.launch()

  // --- Login and get storage state ---
  const setupCtx = await browser.newContext({ viewport: MOBILE })
  const setupPage = await setupCtx.newPage()
  await setupPage.goto(`${BASE}/login`)
  await setupPage.getByPlaceholder('you@example.com').fill(EMAIL)
  await setupPage.locator('input[type="password"]').fill(PASSWORD)
  await setupPage.getByRole('button', { name: /sign in|log in/i }).click()
  await setupPage.waitForURL(`${BASE}/`)
  const storage = await setupCtx.storageState()
  await setupCtx.close()

  // Get a workout ID and exercise ID for detail pages
  const apiCtx = await browser.newContext()
  const apiPage = await apiCtx.newPage()
  const tokenRes = await apiPage.request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD }
  })
  const token = (await tokenRes.json()).data.token
  const headers = { Authorization: `Bearer ${token}` }

  const wRes = await apiPage.request.get(`${API}/workouts?limit=1`, { headers })
  const workouts = (await wRes.json()).data ?? []
  const workoutId = workouts[0]?.id

  const exRes = await apiPage.request.get(`${API}/exercises?limit=1`, { headers })
  const exercises = (await exRes.json()).data ?? []
  const exerciseId = exercises[0]?.id
  const exerciseName = exercises[0]?.name ?? 'Bench Press'

  const pRes = await apiPage.request.get(`${API}/programs?limit=1`, { headers })
  const programs = (await pRes.json()).data ?? []
  const programId = programs[0]?.id

  await apiCtx.close()

  async function shoot(name: string, url: string, viewport: typeof MOBILE | typeof DESKTOP, setup?: (p: any) => Promise<void>) {
    const ctx = await browser.newContext({ storageState: storage, viewport })
    if (setup) {
      await ctx.addInitScript(setup as any)
    }
    const page = await ctx.newPage()
    await page.goto(`${BASE}${url}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
    console.log(`  ✓ ${name}.png`)
    await ctx.close()
  }

  async function shootGymMode(
    name: string,
    phase: 'overview' | 'exercise-info' | 'exercise',
    viewport: typeof MOBILE | typeof DESKTOP,
    exId: number,
    exName: string,
  ) {
    const ctx = await browser.newContext({ storageState: storage, viewport })
    const gymUi = { phase, exIdx: 0, setIdx: 0 }
    await ctx.addInitScript(
      ({ sk, lk, uk, session, ui }: any) => {
        localStorage.setItem(sk, JSON.stringify(session))
        localStorage.setItem(lk, 'gym')
        localStorage.setItem(uk, JSON.stringify(ui))
      },
      {
        sk: SESSION_KEY,
        lk: LAYOUT_KEY,
        uk: 'lyftr_gym_ui',
        session: {
          name: 'Push Day',
          started_at: new Date().toISOString(),
          exercises: [
            {
              exercise_id: exId,
              exercise: {
                id: exId, name: exName, muscle_group: 'Chest',
                equipment: 'barbell', category: 'strength',
                secondary_muscles: ['Triceps'], description: 'Classic chest press.', image_url: null,
              },
              notes: '',
              sets: [
                { set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: true },
                { set_number: 2, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: false },
                { set_number: 3, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: false },
              ],
            },
          ],
        },
        ui: gymUi,
      }
    )
    const page = await ctx.newPage()
    await page.goto(`${BASE}/workout/active`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
    console.log(`  ✓ ${name}.png`)
    await ctx.close()
  }

  console.log('\nCapturing mobile screenshots…')
  await shoot('dashboard-mobile', '/', MOBILE)
  await shoot('workouts-mobile', '/workouts', MOBILE)
  if (workoutId) await shoot('workout-detail-mobile', `/workouts/${workoutId}`, MOBILE)
  await shoot('programs-mobile', '/programs', MOBILE)
  if (programId) await shoot('program-detail-mobile', `/programs/${programId}`, MOBILE)
  if (exerciseId) await shoot('exercise-detail-mobile', `/exercises/${exerciseId}`, MOBILE)
  await shoot('active-workout-mobile', '/workouts/new', MOBILE)
  await shoot('settings-mobile', '/settings', MOBILE)
  if (exerciseId) {
    await shootGymMode('gym-mode-overview-mobile', 'overview', MOBILE, exerciseId, exerciseName)
    await shootGymMode('gym-mode-exercise-mobile', 'exercise', MOBILE, exerciseId, exerciseName)
  }

  console.log('\nCapturing desktop screenshots…')
  await shoot('dashboard-desktop', '/', DESKTOP)
  await shoot('workouts-desktop', '/workouts', DESKTOP)
  if (workoutId) await shoot('workout-detail-desktop', `/workouts/${workoutId}`, DESKTOP)
  await shoot('programs-desktop', '/programs', DESKTOP)
  if (programId) await shoot('program-detail-desktop', `/programs/${programId}`, DESKTOP)
  if (exerciseId) await shoot('exercise-detail-desktop', `/exercises/${exerciseId}`, DESKTOP)
  await shoot('active-workout-desktop', '/workouts/new', DESKTOP)
  await shoot('settings-desktop', '/settings', DESKTOP)
  if (exerciseId) {
    await shootGymMode('gym-mode-overview-desktop', 'overview', DESKTOP, exerciseId, exerciseName)
    await shootGymMode('gym-mode-exercise-desktop', 'exercise', DESKTOP, exerciseId, exerciseName)
  }

  await browser.close()
  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
