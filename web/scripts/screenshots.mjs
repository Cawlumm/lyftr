import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../../docs/screenshots')
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5173'
const EMAIL = 'demo@lyftr.local'
const PASS = 'password123'

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 }
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

async function shot(page, name) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, name), fullPage: false })
  console.log('  saved:', name)
}

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[type="email"]')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`)
  await page.waitForTimeout(1200)
}

async function setLight(page) {
  // set light mode via localStorage
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light')
    document.documentElement.classList.remove('dark')
  })
  await page.waitForTimeout(300)
}

const browser = await chromium.launch()

// ── MOBILE ────────────────────────────────────────────
console.log('\n── Mobile screenshots ──')
{
  const ctx = await browser.newContext({ viewport: MOBILE })
  const page = await ctx.newPage()
  await login(page)
  await setLight(page)

  // Dashboard
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(1500)
  await shot(page, 'dashboard-mobile.png')

  // Workouts list
  await page.goto(`${BASE}/workouts`)
  await page.waitForTimeout(800)
  await shot(page, 'workouts-mobile.png')

  // Workout detail — get first workout id from list
  const wLink = await page.locator('.card button').first()
  await wLink.click()
  await page.waitForTimeout(800)
  await shot(page, 'workout-detail-mobile.png')

  // Programs list
  await page.goto(`${BASE}/programs`)
  await page.waitForTimeout(800)
  await shot(page, 'programs-mobile.png')

  // Program detail
  const pLink = await page.locator('.card button').first()
  await pLink.click()
  await page.waitForTimeout(800)
  await shot(page, 'program-detail-mobile.png')

  // Exercise detail from program detail
  const exLink = await page.locator('button.card').first()
  await exLink.click()
  await page.waitForTimeout(1000)
  await shot(page, 'exercise-detail-mobile.png')

  // Active workout — start from a program
  await page.goto(`${BASE}/programs`)
  await page.waitForTimeout(800)
  // click Play button on first program
  const playBtn = await page.locator('button[title="Start workout"]').first()
  await playBtn.click()
  await page.waitForTimeout(800)
  await shot(page, 'active-workout-mobile.png')

  // Settings
  await page.goto(`${BASE}/settings`)
  await page.waitForTimeout(800)
  await shot(page, 'settings-mobile.png')

  await ctx.close()
}

// ── DESKTOP ───────────────────────────────────────────
console.log('\n── Desktop screenshots ──')
{
  const ctx = await browser.newContext({ viewport: DESKTOP })
  const page = await ctx.newPage()
  await login(page)
  await setLight(page)

  // Dashboard
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(1500)
  await shot(page, 'dashboard-desktop.png')

  // Workouts
  await page.goto(`${BASE}/workouts`)
  await page.waitForTimeout(800)
  await shot(page, 'workouts-desktop.png')

  // Workout detail
  const wLink = await page.locator('.card button').first()
  await wLink.click()
  await page.waitForTimeout(800)
  await shot(page, 'workout-detail-desktop.png')

  // Programs
  await page.goto(`${BASE}/programs`)
  await page.waitForTimeout(800)
  await shot(page, 'programs-desktop.png')

  // Program detail
  const pLink = await page.locator('.card button').first()
  await pLink.click()
  await page.waitForTimeout(800)
  await shot(page, 'program-detail-desktop.png')

  // Exercise detail
  const exLink = await page.locator('button.card').first()
  await exLink.click()
  await page.waitForTimeout(1000)
  await shot(page, 'exercise-detail-desktop.png')

  // Active workout
  await page.goto(`${BASE}/programs`)
  await page.waitForTimeout(800)
  const playBtn = await page.locator('button[title="Start workout"]').first()
  await playBtn.click()
  await page.waitForTimeout(800)
  await shot(page, 'active-workout-desktop.png')

  // Settings
  await page.goto(`${BASE}/settings`)
  await page.waitForTimeout(800)
  await shot(page, 'settings-desktop.png')

  await ctx.close()
}

await browser.close()
console.log('\nDone —', OUT)
