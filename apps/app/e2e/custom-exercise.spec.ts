import type { APIRequestContext } from '@playwright/test'
import path from 'node:path'
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

  // The picker closes and the create page opens with the name prefilled. Main muscle is picked
  // from the list view (the body map has its own test below).
  await expect(page.getByRole('heading', { level: 1, name: 'New exercise' })).toBeVisible()
  await expect(page.getByPlaceholder('e.g. Soleus Slouch')).toHaveValue(name)
  await page.getByRole('button', { name: 'List', exact: true }).first().click()
  await page.getByRole('radio', { name: 'Chest', exact: true }).click()
  await page.getByRole('button', { name: 'Create and add' }).click()

  // Back on the workout form, the new exercise is in it.
  await expect(page.getByRole('heading', { level: 1, name: 'New exercise' })).toHaveCount(0)
  await expect(page.getByText(name, { exact: true }).locator('visible=true').first()).toBeVisible()

  // Library: "Custom only" in the filter sheet lists it, with the badge, and counts as a filter.
  await page.goto('/workouts/exercises')
  await page.getByRole('button', { name: /^Filters/ }).locator('visible=true').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Custom only' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Filters, 1 active' }).locator('visible=true').first()).toBeVisible()
  await expect(page).toHaveURL(/[?&]show=mine/)
  const row = page.getByRole('link', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Custom', { exact: true })).toBeVisible()

  // Its page: Archive from the actions menu, then the archived note shows.
  await row.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(page.getByText(/Archived\. It's hidden from search/)).toBeVisible()
  const detail = page.url()

  // Archived: gone from Mine.
  await page.goto('/workouts/exercises?show=mine')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)

  // Restore from its page brings it back.
  await page.goto(detail)
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await expect(page.getByText(/Archived\. It's hidden from search/)).toHaveCount(0)
  await page.goto('/workouts/exercises?show=mine')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
})

// Cancel sits beside Create; with something typed it asks before throwing it away.
test('Cancel on the create page asks before discarding what was typed', async ({ page }) => {
  await page.goto('/workouts/exercise/new')
  await page.getByPlaceholder('e.g. Soleus Slouch').fill('Zz Discard Me')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Discard changes?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByPlaceholder('e.g. Soleus Slouch')).toHaveValue('Zz Discard Me')
})

// The body maps: tapping a region on the first picks the main muscle; on the second (other
// muscles) it toggles one, the main muscle is refused with a reason, and a chip removes one again.
// Each figure is an SVG whose <path id> is the region, so the main picker's is the first match.
test('create a custom exercise by tapping the body maps', async ({ page }) => {
  const name = `Zz Body Map ${Date.now().toString(36).toUpperCase()}`
  await page.goto(`/workouts/exercise/new?name=${encodeURIComponent(name)}`)
  // Only the main muscle's map is live; the other muscles' waits, dimmed, until it is picked.
  await expect(page.getByText('Nothing picked yet')).toHaveCount(1)
  await expect(page.getByText('Pick the main muscle first, then tap any others it works')).toBeVisible()
  await page.locator('#chest').first().click()
  await expect(page.getByText('Main muscle: Chest')).toBeVisible()
  await expect(page.getByText('Tap any others it works, up to 10')).toBeVisible()

  await page.locator('#chest').last().click()
  await expect(page.getByText('Chest is already the main muscle.')).toBeVisible()
  await page.locator('#biceps').last().click()
  await page.locator('#triceps').last().click()
  await expect(page.getByRole('button', { name: 'Remove Biceps' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Triceps' }).click()
  await expect(page.getByRole('button', { name: 'Remove Triceps' })).toHaveCount(0)

  const created = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/api/v1/exercises') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const body = (await (await created).json()).data
  expect(body.muscle_group).toBe('chest')
  expect(body.secondary_muscles).toEqual(['biceps'])
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
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
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit exercise' })).toBeVisible()
  const field = page.getByPlaceholder('e.g. Soleus Slouch')
  await expect(field).toHaveValue(oldName)
  await field.fill(newName)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
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
  await page.getByRole('menuitem', { name: /^Merge into another exercise/ }).click()

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

// Photo: Add photo from the actions menu opens a file chooser (web has no camera), the hero then
// draws the authed image as a data: URI, and Remove photo puts the plain layout back.
test('adding and removing a custom exercise photo', async ({ page, request, workerAuth }) => {
  const api = await seed(request, workerAuth.token)
  const name = `Zz Photo ${tag()}`
  const ex = await api.exercise(name)

  await page.goto(`/workouts/exercise/${ex.id}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.locator('img[src^="data:"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('menuitem', { name: 'Add photo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('dialog').getByRole('button', { name: 'Choose photo' }).click()
  await (await chooser).setFiles(path.join(__dirname, 'fixtures', 'exercise-photo.jpg'))

  await expect(page.getByText('Photo updated')).toBeVisible()
  await expect(page.locator('img[src^="data:"]').first()).toBeAttached()

  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await page.getByRole('menuitem', { name: 'Remove photo' }).click()
  await expect(page.getByText('Photo removed')).toBeVisible()
  await expect(page.locator('img[src^="data:"]')).toHaveCount(0)
})
