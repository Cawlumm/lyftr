import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'

// The shared Sheet on web: a bottom sheet below sm, a centred dialog from sm up, and on both the
// modal dialog contract of https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (name from the
// visible title, focus moves in, Tab wraps inside, Escape closes, focus goes back to the opener).
// Settings carries two of its users: the language picker and the destructive delete-account
// confirm, the second at the bottom of a page long enough to scroll.

const WIDTHS = [390, 1280] as const

const focusInside = (dialog: Locator) => dialog.evaluate(el => el.contains(document.activeElement))

async function openFromKeyboard(page: Page, opener: Locator) {
  await opener.scrollIntoViewIfNeeded()
  await opener.focus()
  await page.keyboard.press('Enter')
}

const languageRow = (page: Page) => page.getByRole('button', { name: /^Language/ })
// The row, not the sheet's confirm button of the same name: aria-modal is what tells assistive
// tech the page behind is out of reach, so the page's buttons stay in Playwright's role tree.
const deleteRow = (page: Page) => page.getByRole('button', { name: /^Delete account Permanently/ })

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test.beforeEach(async ({ page }) => {
      await page.goto('/settings')
      await expect(languageRow(page)).toBeVisible()
    })

    test('Tab never leaves the dialog, Escape closes it onto the opener', async ({ page }, testInfo) => {
      const opener = languageRow(page)
      await openFromKeyboard(page, opener)
      const dialog = page.getByRole('dialog', { name: 'Language' })
      await expect(dialog).toBeVisible()
      await expect.poll(() => focusInside(dialog)).toBe(true)
      await testInfo.attach(`language-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' })

      for (let i = 0; i < 25; i++) {
        await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab')
        expect(await focusInside(dialog), `focus left the dialog after ${i + 1} presses`).toBe(true)
      }

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
    })

    test('a destructive confirm is named, described, and starts on its password field, with Cancel in reach', async ({ page }, testInfo) => {
      await openFromKeyboard(page, deleteRow(page))
      const dialog = page.getByRole('dialog', { name: 'Delete account?' })
      await expect(dialog).toHaveAttribute('aria-modal', 'true')
      await expect(dialog).toHaveAccessibleDescription(/permanently deletes your account/)
      // Focus goes to the first thing that needs input (APG: the first focusable element, or the one
      // the task starts with), which for a confirm that asks for the password is the password field.
      // Cancel stays two Tabs away (past the show-password toggle) and Confirm is held until a password is typed.
      await expect(dialog.getByRole('textbox', { name: 'Current password' })).toBeFocused()
      await expect(dialog.getByRole('button', { name: 'Delete account' })).toBeDisabled()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Show current password' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
      const { violations } = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(violations.map(v => v.id)).toEqual([])
      await testInfo.attach(`confirm-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' })
    })

    test('opening locks the page without shifting it', async ({ page }) => {
      const opener = deleteRow(page)
      await opener.scrollIntoViewIfNeeded()
      const before = await opener.boundingBox()
      const docWidth = await page.evaluate(() => document.documentElement.clientWidth)

      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Delete account?' })
      await expect(dialog).toBeVisible()
      await page.mouse.move(5, 5)
      await page.mouse.wheel(0, 800)
      await page.waitForTimeout(200)

      expect(await opener.boundingBox()).toEqual(before)
      expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(docWidth)
    })

    test('the scrim closes only a press that started on it', async ({ page }) => {
      await deleteRow(page).click()
      const dialog = page.getByRole('dialog', { name: 'Delete account?' })
      const title = dialog.getByText('Delete account?')
      await expect(title).toBeVisible()

      // Pressed on the title, released over the scrim: a drag out of the dialog, not a dismiss.
      const box = (await title.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(5, 5, { steps: 4 })
      await page.mouse.up()
      await expect(dialog).toBeVisible()

      await page.mouse.click(5, 5)
      await expect(dialog).toBeHidden()
    })
  })
}

test('below sm it is a bottom sheet, from sm up a centred dialog', async ({ page }) => {
  for (const [width, centred] of [[390, false], [1280, true]] as const) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/settings')
    await deleteRow(page).click()
    const title = page.getByRole('dialog').getByText('Delete account?')
    await expect(title).toBeVisible()
    const box = (await title.boundingBox())!
    if (centred) {
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2)
      expect(Math.abs(box.y - 400)).toBeLessThan(200)
      await expect(page.getByTestId('sheet-grabber')).toHaveCount(0)
    } else {
      expect(box.y).toBeGreaterThan(400)
      await expect(page.getByTestId('sheet-grabber')).toBeVisible()
    }
    await page.keyboard.press('Escape')
  }
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })

  test('the dialog opens with nothing animating', async ({ page }) => {
    await page.goto('/settings')
    await deleteRow(page).click()
    await expect(page.getByRole('dialog', { name: 'Delete account?' })).toBeVisible()
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0)
  })
})

test.describe('a short window', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('the dialog fits the viewport and its content stays reachable by scrolling', async ({ page }) => {
    // The exercise filters: two groups of chips, taller than a phone held sideways.
    await page.goto('/workouts/exercises')
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Filters' })
    await expect(dialog).toBeVisible()

    const last = dialog.getByRole('button', { name: 'Bands', exact: true })
    const surface = await last.evaluateHandle(el => {
      let n = el.parentElement
      while (n && getComputedStyle(n).overflowY !== 'auto') n = n.parentElement
      return n!
    })
    const box = (await surface.asElement()!.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(390)
    expect(await surface.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)

    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport()
  })
})
