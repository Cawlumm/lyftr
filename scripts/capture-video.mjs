#!/usr/bin/env node
// Records the short looping product tours in docs/media/ (README GIFs, landing-page hero
// video) from a running Lyftr stack, using the same stack and demo account as
// capture-screenshots.mjs.
//
//   node scripts/capture-video.mjs --base http://localhost
//   node scripts/capture-video.mjs --base http://localhost --only mobile --ffmpeg /path/to/ffmpeg
//   node scripts/capture-video.mjs --base http://localhost --top-up
//
// That writes tour-{desktop,mobile}.{jpg,mp4,webm,gif} to docs/media (README). The landing
// page is dark, so its hero plays a dark take:
//
//   node scripts/capture-video.mjs --base http://localhost --only desktop --theme dark --formats jpg,mp4,webm --out site/public/media
//
// --formats also takes webp (animated): measured against the GIF it came out larger at the
// same width and frame rate, so the README uses the GIF.
//
// Needs `ffmpeg` on PATH (or --ffmpeg) and the stack described in capture-screenshots.mjs.
// --top-up is the same write as there: it logs this week's sessions so the dashboard does
// not read "0 sessions". The tour itself starts a workout in a throwaway browser context
// and never finishes it, so nothing it does is saved to the account.
//
// Frames come from Chromium's screencast (quality-95 JPEG, each with its own swap
// timestamp) rather than Playwright's recordVideo, which encodes real-time VP9 at a capped
// bitrate, tuned for speed rather than for text. Waits for the network are cut out of the timeline, so a click lands straight
// on the loaded screen. The pointer is drawn by the page, since headless Chromium paints
// none; on the phone a tap shows a ripple instead.
import { chromium } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { VIEWPORTS, connect, createApi, newSignedInPage, topUp } from './capture-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost' },
    out: { type: 'string', default: resolve(root, 'docs/media') },
    only: { type: 'string' },
    theme: { type: 'string', default: 'light' },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    formats: { type: 'string', default: 'jpg,mp4,webm,gif' },
    email: { type: 'string', default: 'demo@lyftr.local' },
    password: { type: 'string', default: 'password123' },
    'top-up': { type: 'boolean', default: false },
  },
})
const BASE = args.base.replace(/\/$/, '')
const only = args.only ? new Set(args.only.split(',')) : null
const suffix = args.theme === 'light' ? '' : `-${args.theme}`
const formats = new Set(args.formats.split(','))
mkdirSync(args.out, { recursive: true })

if (spawnSync(args.ffmpeg, ['-version']).status !== 0) {
  throw new Error(`ffmpeg not found at "${args.ffmpeg}": put it on PATH or pass --ffmpeg`)
}

const api = createApi(BASE)
const account = await connect(api, args)
if (args['top-up']) await topUp(api, account)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// ── Overlay: pointer (desktop) and tap ripple (phone) ─────────────────────────
function installOverlay({ pointer }) {
  const css = `
    #tour-pointer { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
      width: 26px; height: 26px; transform: translate(-100px, -100px); transition: scale 90ms ease-out; }
    #tour-pointer.down { scale: 0.86; }
    .tour-ripple { position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 9999px;
      width: 44px; height: 44px; margin: -22px 0 0 -22px; background: rgba(8, 121, 144, 0.28);
      border: 2px solid rgba(8, 121, 144, 0.55); animation: tour-ripple 420ms ease-out forwards; }
    @keyframes tour-ripple { from { scale: 0.4; opacity: 1 } to { scale: 1.25; opacity: 0 } }
    * { cursor: none !important; caret-color: transparent !important; }`
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  if (pointer) {
    const el = document.createElement('div')
    el.id = 'tour-pointer'
    el.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,.35))">
      <path d="M5 3.5 L5 21 L9.6 16.8 L12.6 23.4 L15.6 22 L12.7 15.6 L19 15.4 Z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    document.body.appendChild(el)
    addEventListener('mousemove', (e) => { el.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 3}px)` }, true)
    addEventListener('mousedown', () => el.classList.add('down'), true)
    addEventListener('mouseup', () => el.classList.remove('down'), true)
  }
  window.__tourRipple = (x, y) => {
    const r = document.createElement('div')
    r.className = 'tour-ripple'
    r.style.left = `${x}px`
    r.style.top = `${y}px`
    document.body.appendChild(r)
    setTimeout(() => r.remove(), 500)
  }
}

// ── A take: one page, one screencast, a timeline with the waits cut out ───────
class Take {
  constructor(page, form) {
    this.page = page
    this.form = form
    this.frames = []
    this.cuts = []
    this.inflight = new Set()
    this.lastNetwork = Date.now()
    this.x = VIEWPORTS[form].viewport.width / 2
    this.y = VIEWPORTS[form].viewport.height / 2
    const track = (r) => { this.inflight.add(r); this.lastNetwork = Date.now() }
    const done = (r) => { this.inflight.delete(r); this.lastNetwork = Date.now() }
    page.on('request', track)
    page.on('requestfinished', done)
    page.on('requestfailed', done)
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page)
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      this.frames.push({ t: metadata.timestamp, data: Buffer.from(data, 'base64') })
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95 })
    this.t0 = Date.now() / 1000
  }

  async stop() {
    this.t1 = Date.now() / 1000
    await this.cdp.send('Page.stopScreencast')
  }

  // Waits for the screen a click asked for: the requests it starts, then fonts, images and
  // two painted frames. Callers run it inside offCamera, so the wait never reaches the video.
  async settle({ quiet = 250 } = {}) {
    const from = Date.now()
    await sleep(80) // let the click's first request leave
    while (this.inflight.size || Date.now() - Math.max(this.lastNetwork, from) < quiet) {
      if (Date.now() - from > 15000) throw new Error(`network never went idle: ${[...this.inflight].map((r) => r.url()).join(', ')}`)
      await sleep(25)
    }
    await this.page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r })))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })
  }

  // Runs `fn`, settles, and cuts all of it from the timeline: the video goes straight from
  // the last frame before to the settled screen after. The pointer is put back where the
  // viewer last saw it, so it does not jump across the cut.
  async offCamera(fn = async () => {}) {
    const a = Date.now() / 1000
    await fn()
    await this.settle()
    if (this.form === 'desktop') await this.page.mouse.move(this.x, this.y)
    await this.settle({ quiet: 60 })
    this.cuts.push([a, Date.now() / 1000])
  }

  async hold(ms) { await sleep(ms) }

  async moveTo(x, y, ms = 520) {
    const [x0, y0] = [this.x, this.y]
    const start = Date.now()
    for (;;) {
      const k = Math.min(1, (Date.now() - start) / ms)
      const e = easeInOut(k)
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
      if (k === 1) break
      await sleep(8)
    }
    ;[this.x, this.y] = [x, y]
  }

  async center(locator) {
    await locator.waitFor({ state: 'visible' })
    const b = await locator.boundingBox()
    return [b.x + b.width / 2, b.y + b.height / 2]
  }

  // Desktop: glide, rest, press. Phone: a tap where a thumb would land. Either way the
  // ripple starts a beat before the action, so the press reads before the screen changes.
  async click(target, { travel = 520 } = {}) {
    const [x, y] = Array.isArray(target) ? target : await this.center(target)
    const ripple = () => this.page.evaluate(([x, y]) => window.__tourRipple(x, y), [x, y])
    if (this.form === 'mobile') {
      await ripple()
      await sleep(170)
      await this.page.touchscreen.tap(x, y)
      return
    }
    await this.moveTo(x, y, travel)
    await sleep(90)
    await ripple()
    await this.page.mouse.down()
    await sleep(140)
    await this.page.mouse.up()
  }

  // A click that changes screen: the wait for the new one is cut.
  async go(target, opts) {
    await this.click(target, opts)
    await this.offCamera()
  }

  // Eased scroll of whichever scroller sits under (x, y): RN-web's ScrollView is a div,
  // so wheel events would arrive as discrete jumps.
  async scroll(dy, ms = 1000, at = [this.x, this.y]) {
    await this.page.evaluate(async ({ x, y, dy, ms }) => {
      let el = document.elementFromPoint(x, y)
      while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement
      el ??= document.scrollingElement
      const from = el.scrollTop
      const to = Math.max(0, Math.min(from + dy, el.scrollHeight - el.clientHeight))
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
      await new Promise((done) => {
        const s = performance.now()
        const step = (now) => {
          const k = Math.min(1, (now - s) / ms)
          el.scrollTop = from + (to - from) * ease(k)
          if (k < 1) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      })
    }, { x: at[0], y: at[1], dy, ms })
  }

  // Frames on a timeline with every cut closed up. The screencast only sends a frame when
  // something repaints, so the last frame inside a cut is carried to the cut's end: it is
  // the settled screen, and may be the only frame of it there is.
  timeline() {
    const live = this.frames.filter((f) => f.t >= this.t0 - 0.05)
    const kept = live.filter((f) => !this.cuts.some(([a, b]) => f.t > a && f.t < b))
    for (const [a, b] of this.cuts) {
      const last = live.findLast((f) => f.t < b)
      if (last && last.t > a) kept.push({ t: b, data: last.data })
    }
    kept.sort((p, q) => p.t - q.t)
    const shift = (t) => t - this.cuts.filter(([, b]) => b <= t).reduce((n, [a, b]) => n + (b - a), 0)
    const out = kept.map((f) => ({ t: shift(f.t), data: f.data }))
    const end = shift(this.t1)
    return out.map((f, i) => ({ ...f, d: Math.max(0.001, (out[i + 1]?.t ?? end) - f.t) }))
  }
}

// ── The tours ─────────────────────────────────────────────────────────────────
// The sidebar is links; the phone's tab bar is tabs.
const nav = (page, name) => page.getByRole('link', { name, exact: true }).or(page.getByRole('tab', { name, exact: true }))

// Gym Mode opens on an overview, then an exercise intro: skip both to the first set.
const skipToFirstSet = (take, page) => async () => {
  await take.settle()
  await page.getByText('Start Workout', { exact: true }).click()
  await take.settle()
  await page.getByText('Begin Exercise', { exact: true }).click()
}

const tours = {
  // Dashboard -> program -> Gym Mode set + rest timer -> nutrition -> weight.
  desktop: async (take, page) => {
    await take.hold(900)
    await take.scroll(460, 1000)
    await take.hold(700)
    await take.click(nav(page, 'Programs'), { travel: 600 })
    // The list holds one card; open it straight away.
    await take.offCamera(async () => {
      await take.settle()
      await page.getByRole('link', { name: /^PPL .* Push Pull Legs$/ }).click()
    })
    await take.hold(900)
    await take.click(page.getByRole('button', { name: 'Start workout', exact: true }))
    await take.offCamera(skipToFirstSet(take, page))
    await take.hold(600)
    await take.click(page.getByRole('button', { name: 'Complete Set', exact: true }), { travel: 450 })
    await take.hold(1400)
    // The dialog is modal: the click lands on its backdrop, and Escape (minimize) plus the
    // real navigation happen off camera.
    const nutrition = await take.center(nav(page, 'Nutrition'))
    await take.click(nutrition, { travel: 650 })
    await take.offCamera(async () => {
      await page.keyboard.press('Escape')
      await take.settle()
      await nav(page, 'Nutrition').click()
    })
    await take.hold(400)
    await take.moveTo(640, 360, 550)
    await take.hold(500)
    await take.go(nav(page, 'Weight'), { travel: 550 })
    await take.hold(200)
    await take.moveTo(780, 470, 650)
    await take.hold(1100)
  },
  // Home -> Gym Mode set + rest timer -> nutrition.
  mobile: async (take, page) => {
    await take.hold(1600)
    await take.click(page.getByRole('button', { name: /^Start (Push|Pull|Legs)/ }).first())
    await take.offCamera(skipToFirstSet(take, page))
    await take.hold(800)
    await take.click(page.getByRole('button', { name: 'Complete Set', exact: true }))
    await take.hold(2000)
    await take.click(page.getByRole('button', { name: 'More options' }))
    await take.click(page.getByRole('menuitem', { name: 'Minimize' }))
    await take.offCamera(async () => {
      await take.settle()
      await nav(page, 'Nutrition').click()
    })
    await take.hold(800)
    await take.scroll(320, 900)
    await take.hold(1000)
  },
}

// ── Encoding ──────────────────────────────────────────────────────────────────
function ffmpeg(...a) {
  const r = spawnSync(args.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${a.join(' ')}`)
}

const GIF_WIDTH = { desktop: 960, mobile: 360 }

function encode(name, timeline, form) {
  const dir = mkdtempSync(join(tmpdir(), 'lyftr-tour-'))
  try {
    const list = ['ffconcat version 1.0']
    timeline.forEach((f, i) => {
      const file = `f${String(i).padStart(5, '0')}.jpg`
      writeFileSync(join(dir, file), f.data)
      list.push(`file '${file}'`, `duration ${f.d.toFixed(4)}`)
    })
    list.push(list.at(-2)) // the concat demuxer drops the last entry's duration otherwise
    writeFileSync(join(dir, 'list.txt'), list.join('\n'))
    const input = ['-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt')]
    const out = (ext) => resolve(args.out, `${name}.${ext}`)
    const gw = GIF_WIDTH[form]

    const encoders = {
      jpg: () => ffmpeg('-i', join(dir, 'f00000.jpg'), '-q:v', '3', out('jpg')),
      mp4: () => ffmpeg(...input, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '25',
        '-tune', 'animation', '-movflags', '+faststart', '-an', out('mp4')),
      webm: () => ffmpeg(...input, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0',
        '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-an', out('webm')),
      // One palette for the whole clip (the UI barely changes colour), and only the
      // changed rectangle stored per frame: static holds cost almost nothing.
      gif: () => ffmpeg(...input, '-vf', `fps=15,scale=${gw}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop', '0', out('gif')),
      webp: () => ffmpeg(...input, '-vf', `fps=15,scale=${gw}:-1:flags=lanczos`, '-c:v', 'libwebp', '-lossless', '0',
        '-q:v', '72', '-compression_level', '6', '-loop', '0', out('webp')),
    }
    for (const [ext, run] of Object.entries(encoders)) {
      if (!formats.has(ext)) continue
      run()
      console.log(`  ${name}.${ext}  ${(statSync(out(ext)).size / 1024).toFixed(0)} KB`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const browser = await chromium.launch()
let failed = 0
for (const [form, tour] of Object.entries(tours)) {
  if (only && !only.has(form)) continue
  const name = `tour-${form}${suffix}`
  const { ctx, page, problems } = await newSignedInPage(browser, {
    base: BASE, form, theme: args.theme, layout: 'gym', email: args.email, password: args.password,
  })
  try {
    const take = new Take(page, form)
    await page.waitForLoadState('networkidle')
    await page.evaluate(installOverlay, { pointer: form === 'desktop' })
    await page.evaluate(() => document.activeElement?.blur())
    if (form === 'desktop') await take.moveTo(1100, 300, 1)
    await take.settle({ quiet: 600 })
    await sleep(1500) // charts finish their entrance before the first frame
    await take.start()
    await tour(take, page)
    await take.stop()
    if (problems.length) throw new Error(problems.join('\n'))
    const timeline = take.timeline()
    const secs = timeline.reduce((n, f) => n + f.d, 0)
    console.log(`${name}: ${timeline.length} frames, ${secs.toFixed(1)} s, ${take.cuts.length} cut(s)`)
    encode(name, timeline, form)
  } catch (e) {
    failed++
    console.error(`FAIL ${name}: ${String(e.message ?? e).split('\n').slice(0, 4).join(' | ')}`)
  }
  await ctx.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
