import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'

// The web Tooltip and Menu. The Menu is tested through the sidebar's user menu; the Tooltip, and
// a menu inside a dialog, still go through the dev-only /dev-overlays route (app/dev-overlays.tsx)
// until chart tooltips (C22) give them a real screen. Contracts:
// tooltip https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ and WCAG 1.4.13
// (https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html); menu button
// https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ with the menu keyboard model of
// https://www.w3.org/WAI/ARIA/apg/patterns/menubar/.

test.use({ viewport: { width: 1280, height: 800 } })

const isFocused = (l: Locator) => l.evaluate(el => el === document.activeElement)

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return
  }
  throw new Error('Tab never reached the target')
}

const deleteButton = (page: Page) => page.getByRole('button', { name: 'Delete', exact: true })
const trigger = (page: Page) => page.getByRole('button', { name: 'Options', exact: true })

async function openStory(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lyftr:dev-stories', '1'))
  await page.goto('/dev-overlays')
  await expect(trigger(page)).toBeVisible()
}

test.describe('Tooltip', () => {
  test.beforeEach(async ({ page }) => openStory(page))

  test('keyboard focus shows it, it describes the trigger, Escape hides it and keeps focus', async ({ page }) => {
    const button = deleteButton(page)
    await expect(button).toHaveAccessibleDescription('This cannot be undone')
    await tabTo(page, button)
    const tip = page.getByRole('tooltip', { name: 'This cannot be undone' })
    await expect(tip).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
    expect(await isFocused(button)).toBe(true)

    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(tip).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(tip).toBeHidden()
  })

  test('hover shows it and the pointer can move onto it without it closing', async ({ page }) => {
    const tip = page.getByRole('tooltip', { name: 'This cannot be undone' })
    await deleteButton(page).hover()
    await expect(tip).toBeVisible()
    const box = (await tip.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
    await page.waitForTimeout(400)
    await expect(tip).toBeVisible()
    await page.mouse.move(640, 600)
    await expect(tip).toBeHidden()
  })

  test('a trigger that was not focusable becomes a Tab stop', async ({ page }) => {
    const icon = page.getByRole('img', { name: 'Notes' })
    await tabTo(page, icon)
    await expect(page.getByRole('tooltip', { name: /Rest timer is off/ })).toBeVisible()
    await expect(icon).toHaveAccessibleDescription(/Rest timer is off/)
  })
})

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
    // Contrast is off for the same palette reason as a11y.spec.ts.
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast'])
      .analyze()
    expect(violations).toEqual([])
  })
})

// Escape belongs to the topmost widget (APG dialog-modal and menu-button). react-native-web
// closes a Modal from a document *keyup* listener while the menu and tooltip dismiss on keydown,
// so without swallowEscapeKeyup the one keypress closed both.
test.describe('inside a dialog', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Notes' })

  test.beforeEach(async ({ page }) => {
    await openStory(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(dialog(page)).toBeVisible()
  })

  test('Escape closes an open menu only; the next one closes the dialog', async ({ page }) => {
    const inside = dialog(page).getByRole('button', { name: 'Options', exact: true })
    await inside.focus()
    await page.keyboard.press('ArrowDown')
    const list = dialog(page).getByRole('menu', { name: 'Options' })
    await expect(list).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(list).toBeHidden()
    await expect(dialog(page)).toBeVisible()
    await expect(inside).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  })

  test('Escape dismisses a tooltip only; the next one closes the dialog', async ({ page }) => {
    const save = dialog(page).getByRole('button', { name: 'Save', exact: true })
    // The dialog focuses Save on open, which is not :focus-visible; arriving by key is.
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(save).toBeFocused()
    const tip = page.getByRole('tooltip', { name: 'This cannot be undone' })
    await expect(tip).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
    await expect(dialog(page)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  })
})
