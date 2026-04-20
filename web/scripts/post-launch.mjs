import { chromium } from 'playwright'
import * as readline from 'readline'

function pause(msg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`\n${msg}\nPress ENTER when done... `, () => { rl.close(); resolve() })
  })
}

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] })
const ctx = await browser.newContext({ viewport: null })
const page = await ctx.newPage()

// ── 1. DEV.TO ───────────────────────────────────────────
console.log('\n[1/3] DEV.to')
await page.goto('https://dev.to/enter')
await pause('Log into DEV.to (GitHub login works), then press ENTER')

await page.goto('https://dev.to/new')
await page.waitForTimeout(2000)

// DEV.to uses a rich editor — fill title then body via keyboard
await page.click('textarea#article_title, input[placeholder*="title"], h1[data-placeholder]', { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(500)
await page.keyboard.type('I built a self-hosted alternative to Hevy and Strong', { delay: 20 })

// Click the body area
await page.click('.CodeMirror, .cm-content, [data-testid="article-form__body"]', { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(300)

const devBody = `I got tired of paying for fitness tracking apps and not owning my data, so I built Lyftr — a self-hosted workout tracker you can run on your own server or VPS with one Docker command.

## What it does

- Log workouts with 800+ exercise library (auto-seeded on first run)
- Build reusable programs with target sets and weights
- Active workout mode — guided set-by-set flow
- Dashboard with volume trends, 12-week consistency heatmap, and muscle balance charts
- All data in a single SQLite file you control

## Stack

Go + Gin backend, React + TypeScript + Tailwind frontend, SQLite, Docker + nginx.

## Getting started

\`\`\`bash
git clone https://github.com/Cawlumm/lyftr.git
cd lyftr
cp .env.example .env
docker compose up -d
\`\`\`

Open http://localhost. That's it.

## Why self-hosted?

Your workout history is valuable data. I didn't want it locked in a SaaS that could raise prices, change APIs, or shut down. SQLite means one file to back up.

Still early beta — actively building. Source: https://github.com/Cawlumm/lyftr

Feedback welcome.`

await page.keyboard.type(devBody, { delay: 10 })

await pause('Review the DEV.to post. Add tags: go, react, opensource, fitness — then press ENTER when ready to publish')
// Try clicking publish button
await page.click('button:has-text("Publish"), button:has-text("Submit")').catch(() => {})
await page.waitForTimeout(2000)
console.log('DEV.to done. URL:', page.url())

// ── 2. INDIE HACKERS ────────────────────────────────────
console.log('\n[2/3] Indie Hackers')
await page.goto('https://www.indiehackers.com/sign-in')
await pause('Log into Indie Hackers, then press ENTER')

await page.goto('https://www.indiehackers.com/post/new')
await page.waitForTimeout(2000)
await pause('Indie Hackers post page is open. Manually paste the post (copied from terminal), choose "What are you working on?" group, then press ENTER when submitted')

// ── 3. TWITTER/X ────────────────────────────────────────
console.log('\n[3/3] Twitter/X')
await page.goto('https://x.com/compose/post')
await page.waitForTimeout(2000)
const tweet = `Built Lyftr — a self-hosted, open source workout tracker.

Your data. Your server. One Docker command.

→ 800+ exercises auto-seeded
→ Volume trends + consistency heatmap
→ Program builder
→ Works great on mobile

Still early beta but it's usable daily.

github.com/Cawlumm/lyftr

#buildinpublic #selfhosted #opensource #fitness`

// Try filling compose box
await page.click('[data-testid="tweetTextarea_0"], .DraftEditor-root, [contenteditable="true"]', { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(300)
await page.keyboard.type(tweet, { delay: 15 })

await pause('Log in if needed, review the tweet, then press ENTER to post')
await page.click('[data-testid="tweetButtonInline"], button:has-text("Post")').catch(() => {})
await page.waitForTimeout(2000)
console.log('Twitter done. URL:', page.url())

console.log('\n✓ All done. Closing browser.')
await browser.close()
