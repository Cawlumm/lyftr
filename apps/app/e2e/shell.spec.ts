import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// The responsive shell (app/(tabs)/_layout.tsx, src/components/shell): a sidebar from lg (1024)
// up, the bottom tab bar below it. The sidebar's items are real links (middle-click, Back and
// Forward work) and a plain click still switches tabs through the navigator. Skip link: WCAG 2.4.1
// (https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html); landmarks: ARIA APG
// (https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/).

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' })
const sidebar = (page: Page) => page.locator('#app-sidebar')
const navLink = (page: Page, name: string) => nav(page).getByRole('link', { name, exact: true })
const userMenu = (page: Page) => page.getByRole('button', { name: /, user menu$/ })
const path = (page: Page) => new URL(page.url()).pathname

const focusedRole = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('role'))

for (const width of [390, 768, 1024, 1280, 1920]) {
  const wide = width >= 1024
  test(`at ${width}px the nav is ${wide ? 'a sidebar' : 'the bottom tab bar'}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(nav(page)).toBeVisible()
    const box = (await nav(page).boundingBox())!

    if (wide) {
      await expect(sidebar(page)).toBeVisible()
      await expect(page.getByRole('tablist')).toHaveCount(0)
      await expect(nav(page).getByRole('link')).toHaveCount(5)
      expect(box.x).toBeLessThan(40)
      const main = (await page.getByRole('main').boundingBox())!
      expect(main.x).toBeGreaterThanOrEqual(240)
    } else {
      await expect(sidebar(page)).toHaveCount(0)
      await expect(page.getByRole('tablist')).toBeVisible()
      expect(box.y + box.height).toBeGreaterThan(900 - 2)
      expect(box.width).toBe(width)
    }

    if ([390, 768, 1280].includes(width)) {
      await page.waitForLoadState('networkidle')
      await testInfo.attach(`shell-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  })
}

test.describe('the sidebar', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(nav(page)).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('items are links with an href, and the current one is marked', async ({ page }) => {
    const expected = [['Home', '/'], ['Workouts', '/workouts'], ['Programs', '/programs'], ['Nutrition', '/nutrition'], ['Weight', '/weight']]
    for (const [name, href] of expected) {
      await expect(navLink(page, name)).toHaveAttribute('href', href)
    }
    await expect(navLink(page, 'Home')).toHaveAttribute('aria-current', 'page')
    await expect(navLink(page, 'Workouts')).not.toHaveAttribute('aria-current', 'page')
  })

  test('keyboard only: the skip link comes first and moves focus to main; Tab walks the nav; Enter navigates', async ({ page }) => {
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    const box = (await skip.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    await page.keyboard.press('Enter')
    await expect.poll(() => focusedRole(page)).toBe('main')
    expect(path(page)).toBe('/')

    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(navLink(page, 'Home')).toBeFocused()
    expect(await navLink(page, 'Home').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
    await page.keyboard.press('Tab')
    await expect(navLink(page, 'Workouts')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/workouts$/)
    await expect(navLink(page, 'Workouts')).toHaveAttribute('aria-current', 'page')
  })

  test('middle-click opens the link in a new tab and leaves this one where it was', async ({ page, context }) => {
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      navLink(page, 'Programs').click({ button: 'middle' }),
    ])
    await popup.waitForLoadState()
    expect(new URL(popup.url()).pathname).toBe('/programs')
    expect(path(page)).toBe('/')
    await popup.close()
  })

  test('Back and Forward move between tabs, and the title follows', async ({ page }) => {
    await expect(page).toHaveTitle('Home · Lyftr')
    await navLink(page, 'Workouts').click()
    await expect(page).toHaveURL(/\/workouts$/)
    await expect(page).toHaveTitle('Workouts · Lyftr')
    await navLink(page, 'Weight').click()
    await expect(page).toHaveURL(/\/weight$/)
    await expect(page).toHaveTitle('Weight · Lyftr')

    await page.goBack()
    await expect(page).toHaveURL(/\/workouts$/)
    await expect(navLink(page, 'Workouts')).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle('Workouts · Lyftr')
    await page.goForward()
    await expect(page).toHaveURL(/\/weight$/)
    await expect(navLink(page, 'Weight')).toHaveAttribute('aria-current', 'page')
  })

  // The reason a click goes through the navigator rather than the href: following the URL would
  // rebuild the Workouts stack from scratch and drop the screen the user had open there.
  test('switching tabs keeps the stack open inside a tab', async ({ page }) => {
    await page.goto('/workouts/new')
    await expect(nav(page)).toBeVisible()
    await navLink(page, 'Home').click()
    await expect(page).toHaveURL(url => new URL(url).pathname === '/')
    await navLink(page, 'Workouts').click()
    await expect(page).toHaveURL(/\/workouts\/new$/)
  })

  test('Settings is reachable from the user menu', async ({ page }) => {
    await userMenu(page).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveTitle('Settings · Lyftr')
  })

  test('the theme item switches light and dark (screenshots of both)', async ({ page }, testInfo) => {
    const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
    const before = await dark()
    await page.waitForLoadState('networkidle')
    await testInfo.attach(`shell-1280-${before ? 'dark' : 'light'}.png`, { body: await page.screenshot(), contentType: 'image/png' })

    await userMenu(page).click()
    await page.getByRole('menuitem', { name: /^(Dark|Light) mode$/ }).click()
    await expect.poll(dark).toBe(!before)
    await testInfo.attach(`shell-1280-${before ? 'light' : 'dark'}.png`, { body: await page.screenshot(), contentType: 'image/png' })

    await userMenu(page).click()
    await page.getByRole('menuitem', { name: /^(Dark|Light) mode$/ }).click()
    await expect.poll(dark).toBe(before)
  })

  test('the page and the open user menu pass axe', async ({ page }) => {
    // Contrast is off for the same palette reason as a11y.spec.ts.
    const axe = () => new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast'])
      .analyze()
    await page.waitForLoadState('networkidle')
    expect((await axe()).violations).toEqual([])
    await userMenu(page).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect((await axe()).violations).toEqual([])
  })

  test('the session pill centres on the content area, not the window', async ({ page }) => {
    const session = JSON.stringify({ name: 'E2E Shell Session', started_at: new Date().toISOString(), exercises: [] })
    await page.addInitScript(s => window.localStorage.setItem('lyftr_active_session', s), session)
    await page.goto('/')
    const pill = page.getByText('E2E Shell Session', { exact: true })
    await expect(pill).toBeVisible()
    const side = (await sidebar(page).boundingBox())!
    const box = (await pill.locator('xpath=ancestor::*[contains(@class, "rounded-full")][1]').boundingBox())!
    const contentCentre = side.x + side.width + (1280 - side.x - side.width) / 2
    expect(Math.abs(box.x + box.width / 2 - contentCentre)).toBeLessThanOrEqual(2)
    expect(box.y + box.height).toBeGreaterThan(800 - 60)
  })

  // Last: it signs the browser context out (the worker's stored tokens are untouched).
  test('Sign out from the user menu lands on the login screen', async ({ page }) => {
    await userMenu(page).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
