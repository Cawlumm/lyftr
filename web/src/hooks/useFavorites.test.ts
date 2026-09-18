import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFavorites, type SavedFood } from '@lyftr/shared'

// The hook lives in @lyftr/shared; the suite is here because it needs jsdom and
// @testing-library, which shared's plain-node jest does not carry (see useNumericText).

const OATS: SavedFood = {
  id: 42, name: 'Oats', brand: 'Quaker',
  calories: 300, protein: 10, carbs: 50, fat: 5, fiber: 3, serving_size: '40 g', barcode: '',
}
const oats = { name: 'Oats', brand: 'Quaker', calories: 300, protein: 10, carbs: 50, fat: 5, fiber: 3, serving_size: '40 g', source: 'saved' as const }

describe('useFavorites epoch', () => {
  // A refresh issued while an unstar is in flight captures the epoch *after* the toggle
  // began. If only the start bumped it, that refresh would come back holding the row the
  // DELETE just removed, match its captured value, and put the phantom favourite back.
  it('moves when a toggle settles, so a load started mid-toggle is seen as stale', async () => {
    let finishDelete!: () => void
    const api = {
      create: () => Promise.resolve(OATS),
      delete: () => new Promise<void>(r => { finishDelete = r }),
    }
    const { result } = renderHook(() => useFavorites(api))
    act(() => { result.current.setSavedFoods([OATS]) })

    let pending!: Promise<unknown>
    act(() => { pending = result.current.toggle(oats) })
    const capturedByRefresh = result.current.epoch.current

    await act(async () => { finishDelete(); await pending })

    expect(result.current.epoch.current).not.toBe(capturedByRefresh)
    expect(result.current.savedFoods).toEqual([])
  })
})
