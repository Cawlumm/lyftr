#!/usr/bin/env node
// Regenerates docs/screenshots/*.png (the README and landing-page images) from a running
// Lyftr stack, so a refresh is a command rather than an afternoon.
//
// Needs: a stack serving the web export with /api proxied to a backend started with
// DEMO_MODE=true (the seeded PPL program, 8 weeks of workouts, weight and food logs), and
// `npm install` at the repo root (for @playwright/test) plus `site/` (for sharp).
//
//   node scripts/capture-screenshots.mjs --base http://localhost
//   node scripts/capture-screenshots.mjs --base http://localhost --only dashboard,food
//   node scripts/capture-screenshots.mjs --base http://localhost --top-up
//
// --top-up writes to the account: the demo seed stops three days before the account was
// created, so on most days "This week" reads 0 sessions. It logs program sessions for
// the days of the current week before today, from the routine's own targets, and skips
// any day that already has one. Never point it at an account whose data you care about.
//
// Desktop is 1440x900 at 1x, mobile 390x844 at 2x (the README shows them at ~150px and
// the site resizes them). Everything is light theme except the `-dark` pair. Output is
// re-encoded losslessly at maximum compression.
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sharp = createRequire(resolve(root, 'site/package.json'))('sharp')

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost' },
    out: { type: 'string', default: resolve(root, 'docs/screenshots') },
    only: { type: 'string' },
    email: { type: 'string', default: 'demo@lyftr.local' },
    password: { type: 'string', default: 'password123' },
    'top-up': { type: 'boolean', default: false },
  },
})
const BASE = args.base.replace(/\/$/, '')
const only = args.only ? new Set(args.only.split(',')) : null
mkdirSync(args.out, { recursive: true })

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// ── API helpers (ids for detail routes, and the optional top-up) ──────────────
async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return (await res.json()).data
}

const token = (await api('auth/login', { method: 'POST', body: { email: args.email, password: args.password } })).token
const [program] = await api('programs', { token })
if (!program) throw new Error('No program on this account: is the backend running with DEMO_MODE=true?')

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

if (args['top-up']) {
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

const [latest] = await api('workouts?limit=1', { token })
const benchLike = program.days.flatMap((d) => d.exercises).find((e) => /bench press/i.test(e.exercise?.name ?? ''))
const exerciseId = (benchLike ?? program.days[0].exercises[0]).exercise_id

// ── Scenes ────────────────────────────────────────────────────────────────────
// Each scene starts from a fresh, signed-in context, so a live session or a layout
// preference never leaks into the next one.
const startNext = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Start (Push|Pull|Legs)/ }).first().click()
  await page.waitForURL(/\/workouts\/active/)
}

const scenes = [
  { name: 'dashboard', path: '/' },
  { name: 'dashboard', path: '/', theme: 'dark', suffix: '-dark' },
  {
    name: 'dashboard-charts',
    forms: ['desktop'],
    run: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      await page.mouse.move(840, 450)
      await page.mouse.wheel(0, 700)
    },
  },
  { name: 'workouts', path: '/workouts' },
  { name: 'workout-detail', path: `/workouts/${latest.id}` },
  { name: 'exercise-library', path: '/workouts/exercises' },
  { name: 'exercise-detail', path: `/workouts/exercise/${exerciseId}` },
  { name: 'programs', path: '/programs' },
  { name: 'program-detail', path: `/programs/${program.id}` },
  { name: 'food', path: '/nutrition' },
  {
    name: 'food-trends',
    run: async (page) => {
      await page.goto(`${BASE}/nutrition`, { waitUntil: 'networkidle' })
      await page.getByText('Trends', { exact: true }).click()
    },
  },
  { name: 'weight', path: '/weight' },
  { name: 'settings', path: '/settings' },
  {
    name: 'active-workout',
    run: async (page) => {
      await startNext(page)
      await page.getByRole('button', { name: /^Complete set 1,/ }).first().click()
    },
  },
  { name: 'gym-mode-overview', layout: 'gym', run: startNext },
  {
    name: 'gym-mode-exercise',
    layout: 'gym',
    run: async (page) => {
      await startNext(page)
      await page.getByText('Start Workout', { exact: true }).click()
      await page.getByText('Begin Exercise', { exact: true }).click()
    },
  },
]

const browser = await chromium.launch()
let failed = 0
for (const scene of scenes) {
  if (only && !only.has(scene.name)) continue
  for (const [form, opts] of Object.entries(VIEWPORTS)) {
    if (scene.forms && !scene.forms.includes(form)) continue
    const file = `${scene.name}${scene.suffix ?? ''}-${form}.png`
    const ctx = await browser.newContext({ ...opts, locale: 'en-US', reducedMotion: 'reduce' })
    await ctx.addInitScript(([theme, layout]) => {
      localStorage.setItem('theme', theme)
      localStorage.setItem('lyftr_workout_layout', layout)
    }, [scene.theme ?? 'light', scene.layout ?? 'list'])
    const page = await ctx.newPage()
    const problems = []
    page.on('pageerror', (e) => problems.push(String(e)))
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
      await page.getByPlaceholder('you@example.com').fill(args.email)
      await page.getByPlaceholder('••••••••').fill(args.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL((u) => !u.pathname.startsWith('/login'))
      if (scene.run) await scene.run(page)
      else await page.goto(BASE + scene.path, { waitUntil: 'networkidle' })
      await page.waitForLoadState('networkidle')
      // No hover or focus ring left behind by the clicks above.
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(opts.viewport.width / 2, 1)
      await page.waitForTimeout(1500)
      if (problems.length) throw new Error(problems.join('\n'))
      const png = await page.screenshot()
      writeFileSync(resolve(args.out, file), await sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer())
      console.log(`ok   ${file}`)
    } catch (e) {
      failed++
      console.error(`FAIL ${file}: ${String(e.message ?? e).split('\n')[0]}`)
    }
    await ctx.close()
  }
}
await browser.close()
process.exit(failed ? 1 : 0)
