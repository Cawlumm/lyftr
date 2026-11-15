import { test, expect } from './fixtures'

// A custom exercise end to end: made from the picker in a new workout (the "I searched and it
// isn't there" path), found under Mine in the library, then archived from its page.
//
// The name is random and not in the oedb stub's catalog, so the picker offers Create for it
// and nothing else matches. The account is the worker's own, so no cleanup is needed.
test('create a custom exercise from the picker, find it under Mine, archive it', async ({ page }) => {
  const name = `Zz Custom Lift ${Date.now().toString(36).toUpperCase()}`

  await page.goto('/workouts/new')
  await page.getByRole('button', { name: 'Add Exercise' }).locator('visible=true').first().click()

  const picker = page.getByRole('dialog')
  await expect(picker).toBeVisible()
  await picker.getByPlaceholder(/Search exercises/).fill(name)

  // The create row's accessibility label is "Create a custom exercise named <name>".
  await picker.getByRole('button', { name: `Create a custom exercise named ${name}` }).click()

  // The create sheet is a second dialog stacked on the picker.
  const sheet = page.getByRole('dialog').last()
  await expect(sheet.getByPlaceholder('e.g. Soleus Slouch')).toHaveValue(name)
  await sheet.getByRole('radio', { name: 'chest', exact: true }).click()
  await sheet.getByRole('button', { name: 'Create and add' }).click()

  // Back on the workout form, the new exercise is in it.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(name, { exact: true }).locator('visible=true').first()).toBeVisible()

  // Library: Mine lists it, with the badge.
  await page.goto('/workouts/exercises')
  const mine = page.getByRole('checkbox', { name: 'Mine' })
  await mine.click()
  await expect(mine).toBeChecked()
  const row = page.getByRole('link', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Custom', { exact: true })).toBeVisible()

  // Its page: Archive from the actions menu, then the archived note shows.
  await row.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText(/Archived\. It's hidden from search/)).toBeVisible()
})
