import type { Page, TestInfo } from '@playwright/test'
import { expect } from './fixtures'

// The widths the layouts are accountable to, in the two regimes they switch between: the
// phone column below lg (1024) and the wide layouts from lg up. A sideways-scroll check loads
// once per regime and resizes through its widths, rather than reloading at each one: every
// width is still checked, on the spec's own seeded data, for a third of the page loads. Each
// regime still gets a fresh load at its first width, and the specs' "at 1280 ..." tests load
// fresh at the wide width they assert on.
export const WIDTH_GROUPS = [[320, 390, 768], [1024, 1280, 1920]] as const

export const noHorizontalScroll = (page: Page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth)

// Resizes through `widths` (the page is already loaded at the first), asserting no sideways
// scroll at each and attaching a screenshot at the widths in `shoot`.
export async function sweepWidths(
  page: Page, testInfo: TestInfo, label: string, widths: readonly number[],
  { shoot = [], height = 900 }: { shoot?: readonly number[]; height?: number } = {},
) {
  for (const width of widths) {
    await page.setViewportSize({ width, height })
    // RN-web re-renders for the new Dimensions after the resize event, so the check first lets
    // two frames pass (the old, narrower layout would pass vacuously), then polls past any
    // overflow that only lasts while the new layout settles.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    await expect.poll(() => noHorizontalScroll(page), `${label} at ${width}`).toBe(true)
    if (shoot.includes(width)) {
      await testInfo.attach(`${label}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  }
}
