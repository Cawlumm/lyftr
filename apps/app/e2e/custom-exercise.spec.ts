import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'
import { API_BASE as API } from './config'

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
  const detail = page.url()

  // Archived: gone from Mine.
  await page.goto('/workouts/exercises')
  await page.getByRole('checkbox', { name: 'Mine' }).click()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)

  // Restore from its page brings it back.
  await page.goto(detail)
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText(/Archived\. It's hidden from search/)).toHaveCount(0)
  await page.goto('/workouts/exercises')
  await page.getByRole('checkbox', { name: 'Mine' }).click()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
})

// Seeds through the API: the flows below start from an exercise that already has history.
const tag = () => Date.now().toString(36).toUpperCase()
const seed = async (request: APIRequestContext, token: string) => {
  const headers = { Authorization: `Bearer ${token}` }
  const data = async (res: Promise<import('@playwright/test').APIResponse>) => {
    const r = await res
    expect(r.ok(), `${r.url()} ${r.status()}`).toBeTruthy()
    return (await r.json()).data
  }
  return {
    exercise: (name: string) => data(request.post(`${API}/exercises`, { headers, data: { name, muscle_group: 'chest' } })),
    workout: (name: string, exerciseId: number, daysAgo: number, weight: number) => data(request.post(`${API}/workouts`, {
      headers,
      data: {
        name, duration: 1800, started_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        exercises: [{ exercise_id: exerciseId, notes: '', sets: [{ set_number: 1, reps: 5, weight }] }],
      },
    })),
    program: (name: string, exerciseId: number) => data(request.post(`${API}/programs`, {
      headers,
      data: {
        name, notes: '',
        days: [{ order_index: 0, is_rest_day: false, name: 'A', exercises: [{ exercise_id: exerciseId, notes: '', rest_seconds: 60, sets: [{ set_number: 1, target_reps: 5, target_weight: 50 }] }] }],
      },
    })),
  }
}

// Renaming is by id, so a workout logged under the old name shows the new one.
test('renaming a custom exercise shows the new name on a past workout', async ({ page, request, workerAuth }) => {
  const t = tag()
  const api = await seed(request, workerAuth.token)
  const oldName = `Zz Rename Old ${t}`
  const newName = `Zz Rename New ${t}`
  const ex = await api.exercise(oldName)
  const workout = await api.workout(`E2E Rename ${t}`, ex.id, 1, 50)

  await page.goto(`/workouts/exercise/${ex.id}`)
  await expect(page.getByRole('heading', { level: 1, name: oldName })).toBeVisible()
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
  const field = sheet.getByPlaceholder('e.g. Soleus Slouch')
  await expect(field).toHaveValue(oldName)
  await field.fill(newName)
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: newName })).toBeVisible()

  await page.goto(`/workouts/${workout.id}`)
  await expect(page.getByRole('link', { name: newName })).toBeVisible()
  await expect(page.getByText(oldName)).toHaveCount(0)
})

// Merge: the confirm states what moves from the server's counts, the history lands on the
// target, and the source's page says where it went.
test('merging a custom exercise states the counts and moves its history to the target', async ({ page, request, workerAuth }) => {
  const t = tag()
  const api = await seed(request, workerAuth.token)
  const from = `Zz Merge From ${t}`
  const into = `Zz Merge Into ${t}`
  const source = await api.exercise(from)
  const target = await api.exercise(into)
  await api.workout(`E2E Merge A ${t}`, source.id, 2, 60)
  await api.workout(`E2E Merge B ${t}`, source.id, 1, 70)
  await api.program(`E2E Merge ${t}`, source.id)

  await page.goto(`/workouts/exercise/${source.id}`)
  await expect(page.getByRole('heading', { level: 1, name: from })).toBeVisible()
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Merge into another exercise/ }).click()

  // The target picker: no Create row, the caller's own exercises listed first.
  await page.getByPlaceholder(/Search exercises/).locator('visible=true').fill(into)
  await expect(page.getByRole('button', { name: /^Create a custom exercise/ })).toHaveCount(0)
  await page.getByRole('button', { name: new RegExp(`^${into}`) }).click()

  const confirm = page.getByRole('dialog', { name: `Merge into “${into}”?` })
  await expect(confirm.getByText(/2 workouts and 1 program day/)).toBeVisible()
  await confirm.getByRole('button', { name: 'Merge', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/workouts/exercise/${target.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: into })).toBeVisible()
  await expect(page.getByText('Personal Best')).toBeVisible()
  await expect(page.getByText('Weight Progression')).toBeVisible()

  await page.goto(`/workouts/exercise/${source.id}`)
  await expect(page.getByText(/^Merged\./)).toBeVisible()
  const link = page.getByRole('link', { name: 'View that exercise' })
  await expect(link).toHaveAttribute('href', `/workouts/exercise/${target.id}`)
})
