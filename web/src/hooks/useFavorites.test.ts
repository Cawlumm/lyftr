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

// A failed star has to be reportable at its own row. The hook used to expose one
// `error` for the whole list, which the screens could only render above it — and a
// banner above a scrolled list is the thing this repo rules out for confirm sheets.
describe('useFavorites errorFor', () => {
  const granola = { ...oats, name: 'Granola', brand: '' }

  const failingApi = {
    create: () => Promise.reject(new Error('nope')),
    delete: () => Promise.reject(new Error('nope')),
  }

  it('reports a failed star only against the food whose star failed', async () => {
    const { result } = renderHook(() => useFavorites(failingApi))

    await act(async () => { await result.current.toggle(oats) })

    // The sentence itself comes from apiErrorMessage — a connection that never answered
    // is reported as such, and only a server that answered without one falls back to
    // "Couldn't add …". What this pins is WHICH row it belongs to.
    expect(result.current.errorFor(oats)).toEqual(expect.any(String))
    expect(result.current.errorFor(oats)).toBe(result.current.error)
    // The food next to it in the list must stay clean, or every row lights up at once.
    expect(result.current.errorFor(granola)).toBeNull()
  })

  // Whitespace is not identity: the server trims, so a row carrying "Oats " is the same
  // food as the stored "Oats" and must still match its own error.
  it('matches on the trimmed name and brand, as findSavedFood does', async () => {
    const { result } = renderHook(() => useFavorites(failingApi))

    await act(async () => { await result.current.toggle(oats) })

    expect(result.current.errorFor({ ...oats, name: '  Oats  ', brand: ' Quaker ' })).not.toBeNull()
  })

  it('clears the previous row’s error when another star is tapped', async () => {
    const { result } = renderHook(() => useFavorites(failingApi))

    await act(async () => { await result.current.toggle(oats) })
    expect(result.current.errorFor(oats)).not.toBeNull()

    await act(async () => { await result.current.toggle(granola) })

    expect(result.current.errorFor(oats)).toBeNull()
    expect(result.current.errorFor(granola)).not.toBeNull()
  })
})
