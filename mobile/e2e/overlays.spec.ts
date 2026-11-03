import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'

// The web Tooltip and Menu, through the dev-only /dev-overlays route (app/dev-overlays.tsx) until
// the user menu (C20) and chart tooltips (C22) give them real screens. Contracts:
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
const menu = (page: Page) => page.getByRole('menu', { name: 'Options', exact: true })
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lyftr:dev-stories', '1'))
  await page.goto('/dev-overlays')
  await expect(trigger(page)).toBeVisible()
})

test.describe('Tooltip', () => {
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

test.describe('Menu', () => {
  test('Enter opens on the first item; arrows wrap, Home/End jump, letters jump', async ({ page }, testInfo) => {
    const button = trigger(page)
    await expect(button).toHaveAttribute('aria-haspopup', 'menu')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await tabTo(page, button)
    await page.keyboard.press('Enter')

    await expect(menu(page)).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(button).toHaveAttribute('aria-controls', await menu(page).getAttribute('id') as string)
    await expect(item(page, 'Edit')).toBeFocused()
    await testInfo.attach('menu-1280.png', { body: await page.screenshot(), contentType: 'image/png' })

    await page.keyboard.press('ArrowUp')
    await expect(item(page, 'Save')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(item(page, 'Edit')).toBeFocused()
    await page.keyboard.press('End')
    await expect(item(page, 'Save')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(item(page, 'Edit')).toBeFocused()
    await page.keyboard.press('d')
    await expect(item(page, 'Delete')).toBeFocused()
    await page.keyboard.press('d')
    await expect(item(page, 'Done')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(menu(page)).toBeHidden()
    await expect(page.getByTestId('picked')).toHaveText('Done')
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  test('ArrowUp opens on the last item; Escape closes onto the button', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('ArrowUp')
    await expect(item(page, 'Save')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
    await expect(trigger(page)).toBeFocused()
  })

  test('Tab closes it and moves on from the button', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('ArrowDown')
    await expect(item(page, 'Edit')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(menu(page)).toBeHidden()
    // The next stop after the trigger is the second menu's button.
    await expect(page.getByRole('button', { name: 'Notes options' })).toBeFocused()
  })

  test('a click runs an item; a press outside closes without running one', async ({ page }) => {
    await trigger(page).click()
    await expect(item(page, 'Edit')).toBeFocused()
    await page.mouse.click(640, 400)
    await expect(menu(page)).toBeHidden()
    await expect(page.getByTestId('picked')).toHaveText('')

    await trigger(page).click()
    await item(page, 'Delete').click()
    await expect(menu(page)).toBeHidden()
    await expect(page.getByTestId('picked')).toHaveText('Delete')
  })

  test('near the bottom-right corner it flips above and stays on screen', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Notes options' })
    await button.click()
    const list = page.getByRole('menu', { name: 'Notes options' })
    await expect(list).toBeVisible()
    const m = (await list.boundingBox())!
    const b = (await button.boundingBox())!
    expect(m.y + m.height).toBeLessThanOrEqual(b.y)
    expect(m.x + m.width).toBeLessThanOrEqual(1280)
    expect(m.y).toBeGreaterThanOrEqual(0)
  })

  test('the open menu passes axe', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('Enter')
    await expect(menu(page)).toBeVisible()
    // Contrast is off for the same palette reason as a11y.spec.ts.
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['color-contrast'])
      .analyze()
    expect(violations).toEqual([])
  })
})
