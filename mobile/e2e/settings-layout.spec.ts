import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures'

// Settings and the sign-in screens on wide web (C32). Settings is a centred max-w-2xl column of
// grouped rows whose drill-ins are real links, with the web-only exercise-cache admin. Sign in
// and register split at lg into a brand panel and the form; below lg they are the phone layout.
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]
const SIDEBAR = 240
const SYNC = '**/api/v1/admin/sync-exercises**'

async function open(page: Page, path: string, width: number, height = 800) {
  await page.setViewportSize({ width, height })
  await page.goto(path)
  await expect(page.getByRole('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

const noHorizontalScroll = (page: Page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth)
const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!
const refreshButton = (page: Page) => page.getByRole('button', { name: /^Refresh(ing)? cached|^Refreshing/ })

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast']) // tracked by the fixme in a11y.spec.ts
    .analyze()
  return violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)
}

test.describe('settings', () => {
  for (const width of WIDTHS) {
    test(`settings and change password do not scroll horizontally at ${width}px`, async ({ page }, testInfo) => {
      for (const path of ['/settings', '/settings/password']) {
        await open(page, path, width)
        expect(await noHorizontalScroll(page), `${path} at ${width}`).toBe(true)
        if ([390, 1280, 1920].includes(width)) {
          await testInfo.attach(`${path.slice(1).replace('/', '-')}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
        }
      }
    })
  }

  test('at 1280 settings is a centred column no wider than max-w-2xl', async ({ page }) => {
    await open(page, '/settings', 1280)
    const main = await box(page.getByRole('main'))
    expect(main.width).toBeLessThanOrEqual(672)
    expect(Math.abs(main.x + main.width / 2 - (SIDEBAR + (1280 - SIDEBAR) / 2))).toBeLessThanOrEqual(2)
  })

  test('the account rows that open a page are links to it', async ({ page }) => {
    await open(page, '/settings', 1280)
    for (const [name, href] of [[/^Name/, '/settings/name'], [/^Email/, '/settings/email'], [/^Password/, '/settings/password']] as const) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    // A row that opens a sheet, and one that acts, stay buttons.
    await expect(page.getByRole('button', { name: /^Language/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Sign out/ })).toBeVisible()
  })

  test('a row link opens its page, and Back returns to settings', async ({ page }) => {
    await open(page, '/settings', 1280)
    await page.getByRole('link', { name: /^Password/ }).click()
    await expect(page).toHaveURL(/\/settings\/password$/)
    await expect(page.getByLabel('Current password', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
    await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
    await page.goBack()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('keyboard: Tab walks the back link, then the account links in order, and Enter follows one', async ({ page }) => {
    await open(page, '/settings', 1280)
    const back = page.getByRole('button', { name: 'Home' })
    await back.focus()
    await expect(back).toBeFocused()
    for (const name of [/^Name/, /^Email/, /^Password/]) {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name })).toBeFocused()
    }
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/settings\/password$/)
  })

  test('the exercise-cache admin shows the cache status on web', async ({ page }) => {
    await open(page, '/settings', 1280)
    await expect(page.getByText('Exercise Library', { exact: true })).toBeVisible()
    await expect(page.getByText('Exercise database', { exact: true })).toBeVisible()
    await expect(page.getByText(/^[\d,]+ cached$/)).toBeVisible()
    await expect(refreshButton(page)).toBeEnabled()
  })

  test('refresh reports what it refreshed', async ({ page }) => {
    // Answered here: the real pass reaches out to the upstream catalog.
    await page.route(SYNC, route => route.fulfill({ json: { data: { refreshed: 812 } } }))
    await open(page, '/settings', 1280)
    await refreshButton(page).click()
    await expect(page.getByRole('status').filter({ hasText: 'Refreshed 812 exercises' })).toBeVisible()
  })

  test('a failed refresh reads as a failure', async ({ page }) => {
    await page.route(SYNC, route => route.fulfill({ status: 500, json: {} }))
    await open(page, '/settings', 1280)
    await refreshButton(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(refreshButton(page)).toBeEnabled()
  })

  test('a shrunken catalog asks to confirm, and confirming sends confirm_removals', async ({ page }) => {
    const sent: string[] = []
    await page.route(SYNC, route => {
      const url = new URL(route.request().url())
      sent.push(url.search)
      return url.searchParams.get('confirm_removals') === 'true'
        ? route.fulfill({ json: { data: { refreshed: 300 } } })
        : route.fulfill({ status: 409, json: { code: 'EXERCISE_CATALOG_SHRANK', error: 'shrank' } })
    })
    await open(page, '/settings', 1280)
    await refreshButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Accept the smaller catalog?' })
    await expect(dialog).toBeVisible()
    expect(await axe(page)).toEqual([])
    await dialog.getByRole('button', { name: 'Sync and hide' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Refreshed 300 exercises' })).toBeVisible()
    expect(sent).toEqual(['', '?confirm_removals=true'])
  })

  test('a failed confirm keeps the dialog open and says why inside it', async ({ page }) => {
    await page.route(SYNC, route => route.fulfill(
      new URL(route.request().url()).searchParams.has('confirm_removals')
        ? { status: 500, json: {} }
        : { status: 409, json: { code: 'EXERCISE_CATALOG_SHRANK', error: 'shrank' } }))
    await open(page, '/settings', 1280)
    await refreshButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Accept the smaller catalog?' })
    await dialog.getByRole('button', { name: 'Sync and hide' }).click()
    await expect(dialog.getByText('Server error. Please try again shortly.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  for (const [name, path, width] of [
    ['settings 1280', '/settings', 1280],
    ['settings 390', '/settings', 390],
    ['change password 1280', '/settings/password', 1280],
  ] as const) {
    test(`axe: ${name} has no structural violations`, async ({ page }) => {
      await open(page, path, width)
      expect(await axe(page)).toEqual([])
    })
  }
})

test.describe('sign in and register', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  const brand = (page: Page) => page.getByText('Track workouts', { exact: true }).locator('visible=true')

  for (const width of WIDTHS) {
    test(`sign in and register do not scroll horizontally at ${width}px`, async ({ page }, testInfo) => {
      for (const path of ['/login', '/register']) {
        await open(page, path, width)
        expect(await noHorizontalScroll(page), `${path} at ${width}`).toBe(true)
        if ([390, 1280, 1920].includes(width)) {
          await testInfo.attach(`${path.slice(1)}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
        }
      }
    })
  }

  for (const width of [1024, 1280, 1920]) {
    test(`at ${width} sign in is a split: the brand panel left, the form right`, async ({ page }) => {
      await open(page, '/login', width)
      const heading = await box(page.getByRole('heading', { level: 1 }))
      const panel = await box(brand(page))
      expect(panel.x + panel.width).toBeLessThan(width / 2)
      expect(heading.x).toBeGreaterThan(width / 2)
      expect((await box(page.getByRole('main'))).width).toBeLessThanOrEqual(400)
    })
  }

  for (const width of [390, 768]) {
    test(`at ${width} sign in keeps the phone layout @mobile`, async ({ page }) => {
      await open(page, '/login', width, 844)
      await expect(brand(page)).toHaveCount(0)
      const heading = await box(page.getByRole('heading', { level: 1 }))
      expect(heading.x).toBeLessThan(60)
    })
  }

  test('the fields carry browser autofill tokens', async ({ page }) => {
    await open(page, '/login', 1280)
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email')
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
    await open(page, '/register', 1280)
    // The auth stack keeps sign-in mounted, hidden, under register.
    await expect(page.getByLabel('Password', { exact: true }).locator('visible=true')).toHaveAttribute('autocomplete', 'new-password')
  })

  test('keyboard: from the email field Tab reaches the password and then Sign in', async ({ page }) => {
    await open(page, '/login', 1280)
    await page.getByLabel('Email', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
    // Past the reveal toggle to the submit.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused()
  })

  test('the register link on the split goes to register, and Back returns', async ({ page }) => {
    await open(page, '/login', 1280)
    await page.getByRole('link', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(brand(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
  })

  for (const [path, width] of [['/login', 1280], ['/register', 1280], ['/login', 390]] as const) {
    test(`axe: ${path} at ${width} has no structural violations`, async ({ page }) => {
      await open(page, path, width)
      expect(await axe(page)).toEqual([])
    })
  }

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('the split sign-in holds still', async ({ page }) => {
      await open(page, '/login', 1280)
      expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0)
    })
  })
})
