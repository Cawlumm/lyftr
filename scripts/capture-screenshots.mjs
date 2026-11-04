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
// re-encoded losslessly at maximum compression. The short looping videos come from
// capture-video.mjs, which shares this script's helpers (capture-lib.mjs).
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { VIEWPORTS, connect, createApi, newSignedInPage, topUp } from './capture-lib.mjs'

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

// ── API helpers (ids for detail routes, and the optional top-up) ──────────────
const api = createApi(BASE)
const account = await connect(api, args)
const { token, program } = account
if (args['top-up']) await topUp(api, account)

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
    let ctx
    try {
      const signedIn = await newSignedInPage(browser, {
        base: BASE, form, theme: scene.theme, layout: scene.layout, email: args.email, password: args.password,
        contextOptions: { reducedMotion: 'reduce' },
      })
      ctx = signedIn.ctx
      const { page, problems } = signedIn
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
    await ctx?.close()
  }
}
await browser.close()
process.exit(failed ? 1 : 0)
