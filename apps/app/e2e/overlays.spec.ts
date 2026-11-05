import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'

// The web Menu, through its real home, the sidebar's user menu. The menu button contract is
// https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ with the menu keyboard model of
// https://www.w3.org/WAI/ARIA/apg/patterns/menubar/. The floating tooltip is tested on the
// charts that use it (charts.spec.ts). No real screen puts a menu or tooltip inside a sheet
// yet, so the one-Escape-per-layer rule is a unit test of swallowEscapeKeyup (overlay.test.ts).

test.use({ viewport: { width: 1280, height: 800 } })

const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return
  }
  throw new Error('Tab never reached the target')
}

// The Menu through its first real home, the sidebar's user menu (src/components/shell/UserMenu.tsx):
// Settings, the theme toggle, Sign out. It sits at the bottom-left of the window, so it also
// proves the flip above its trigger.
test.describe('Menu', () => {
  const userMenu = (page: Page) => page.getByRole('button', { name: /, user menu$/ })
  const list = (page: Page) => page.getByRole('menu', { name: /, user menu$/ })
  const entry = (page: Page, name: string | RegExp) => list(page).getByRole('menuitem', { name })
  const theme = /^(Dark|Light) mode$/

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(userMenu(page)).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('Enter opens on the first item; arrows wrap, Home/End jump, letters jump', async ({ page }, testInfo) => {
    const button = userMenu(page)
    await expect(button).toHaveAttribute('aria-haspopup', 'menu')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await tabTo(page, button)
    await page.keyboard.press('Enter')

    await expect(list(page)).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(button).toHaveAttribute('aria-controls', await list(page).getAttribute('id') as string)
    await expect(entry(page, 'Settings')).toBeFocused()
    await testInfo.attach('menu-1280.png', { body: await page.screenshot(), contentType: 'image/png' })

    await page.keyboard.press('ArrowUp')
    await expect(entry(page, 'Sign out')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(entry(page, 'Settings')).toBeFocused()
    await page.keyboard.press('End')
    await expect(entry(page, 'Sign out')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(entry(page, 'Settings')).toBeFocused()
    await page.keyboard.press('s')
    await expect(entry(page, 'Sign out')).toBeFocused()
    await page.keyboard.press('s')
    await expect(entry(page, 'Settings')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(list(page)).toBeHidden()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  test('ArrowUp opens on the last item; Escape closes onto the button', async ({ page }) => {
    await userMenu(page).focus()
    await page.keyboard.press('ArrowUp')
    await expect(entry(page, 'Sign out')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(list(page)).toBeHidden()
    await expect(userMenu(page)).toBeFocused()
  })

  test('Tab closes it and moves on from the button', async ({ page }) => {
    await userMenu(page).focus()
    await page.keyboard.press('ArrowDown')
    await expect(entry(page, 'Settings')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(list(page)).toBeHidden()
    // The trigger is the sidebar's last stop, so the next one is in the page content.
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=main]'))).toBe(true)
  })

  test('a click runs an item; a press outside closes without running one', async ({ page }) => {
    await userMenu(page).click()
    await expect(entry(page, 'Settings')).toBeFocused()
    // Empty sidebar, between the nav and the footer.
    await page.mouse.click(120, 500)
    await expect(list(page)).toBeHidden()
    expect(new URL(page.url()).pathname).toBe('/')

    const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
    const before = await dark()
    await userMenu(page).click()
    await entry(page, theme).click()
    await expect(list(page)).toBeHidden()
    await expect.poll(dark).toBe(!before)
    await userMenu(page).click()
    await entry(page, theme).click()
    await expect.poll(dark).toBe(before)
  })

  test('at the bottom-left corner it flips above and stays on screen', async ({ page }) => {
    const button = userMenu(page)
    await button.click()
    await expect(list(page)).toBeVisible()
    const m = (await list(page).boundingBox())!
    const b = (await button.boundingBox())!
    expect(m.y + m.height).toBeLessThanOrEqual(b.y)
    expect(m.x).toBeGreaterThanOrEqual(0)
    expect(m.y).toBeGreaterThanOrEqual(0)
  })

  test('the open menu passes axe', async ({ page }) => {
    await userMenu(page).focus()
    await page.keyboard.press('Enter')
    await expect(list(page)).toBeVisible()
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations).toEqual([])
  })
})
