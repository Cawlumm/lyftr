import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// A regression tripwire, not a benchmark. CLS uses Google's own 0.1 "good" bound. The LCP
// bound is the 4s "poor" line from web.dev rather than the 2.5s "good" one, because this
// runs on a shared CI runner under a cold nginx cache with one Chromium worker.
// https://web.dev/articles/lcp  https://web.dev/articles/cls
const LCP_BUDGET_MS = 4000
const CLS_BUDGET = 0.1

// Registered before any page script runs, so the buffered entries are not missed. Layout
// shifts caused by a recent input are excluded, as the CLS definition requires.
const OBSERVE = () => {
  const w = window as unknown as { __lcp: number; __cls: number }
  w.__lcp = 0
  w.__cls = 0
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) w.__lcp = Math.max(w.__lcp, e.startTime)
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
      if (!e.hadRecentInput) w.__cls += e.value
    }
  }).observe({ type: 'layout-shift', buffered: true })
}

async function vitals(page: Page, path: string) {
  await page.addInitScript(OBSERVE)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(path)
  await expect(page.getByRole('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
  // Let late paints and fonts land; LCP only finalises on input or unload, so read it live.
  await page.waitForTimeout(1000)
  return page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number }
    return { lcp: w.__lcp, cls: w.__cls }
  })
}

for (const [name, path] of [['Home', '/'], ['Nutrition', '/nutrition']] as const) {
  test(`${name} stays within LCP and CLS budgets`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'LCP and layout-shift entries are Chromium-only')
    const { lcp, cls } = await vitals(page, path)
    expect(lcp, 'LCP should be reported').toBeGreaterThan(0)
    expect(lcp).toBeLessThan(LCP_BUDGET_MS)
    expect(cls).toBeLessThan(CLS_BUDGET)
  })
}
