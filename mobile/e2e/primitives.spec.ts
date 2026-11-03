import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

// The shared interaction states (src/components/ui/interaction.ts), tested through Settings,
// which holds every primitive that adopts them: Button, SettingsRow, SegmentedControl.

// brand-700, the light theme's --focus-ring.
const RING = 'rgb(0, 122, 150)'

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(el => el === document.activeElement)) return
  }
  throw new Error('Tab never reached the target')
}

const outline = (l: Locator) =>
  l.evaluate(el => {
    const s = getComputedStyle(el)
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }
  })

const style = (l: Locator, prop: 'backgroundColor' | 'cursor') => l.evaluate((el, p) => getComputedStyle(el)[p], prop)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Save targets' })).toBeVisible()
})

test('keyboard focus draws the ring on a Button and a row', async ({ page }) => {
  for (const target of [
    page.getByRole('button', { name: /^Name/ }),
    page.getByRole('button', { name: 'Save targets' }),
  ]) {
    await tabTo(page, target)
    expect(await outline(target)).toEqual({ style: 'solid', width: '2px', color: RING })
  }
})

test('a mouse click focuses without a ring', async ({ page }) => {
  // The selected segment ignores presses, so clicking it changes nothing but focus.
  const segment = page.getByRole('button', { name: 'List', exact: true })
  await segment.click()
  expect(await segment.evaluate(el => el === document.activeElement)).toBe(true)
  expect((await outline(segment)).style).toBe('none')
})

test('hover changes the background and shows a pointer', async ({ page }) => {
  const save = page.getByRole('button', { name: 'Save targets' })
  const row = page.getByRole('button', { name: /^Name/ })
  for (const target of [save, row]) {
    await page.mouse.move(0, 0)
    const before = await style(target, 'backgroundColor')
    await target.hover()
    await expect.poll(() => style(target, 'backgroundColor')).not.toBe(before)
    expect(await style(target, 'cursor')).toBe('pointer')
  }
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('a tap leaves no hover colour behind', async ({ page }) => {
    const save = page.getByRole('button', { name: 'Save targets' })
    const before = await style(save, 'backgroundColor')
    await save.hover()
    expect(await style(save, 'backgroundColor')).toBe(before)
  })
})
