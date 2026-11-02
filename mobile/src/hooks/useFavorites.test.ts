import { renderHook, act } from '@testing-library/react-native'
import { useFavorites, type SavedFood } from '@lyftr/shared'

// The hook lives in @lyftr/shared, whose plain-node jest has no React renderer; the suite
// runs here, where @testing-library/react-native provides one.

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
    const { result } = await renderHook(() => useFavorites(api))
    await act(async () => { result.current.setSavedFoods([OATS]) })

    let pending!: Promise<unknown>
    await act(async () => { pending = result.current.toggle(oats) })
    const capturedByRefresh = result.current.epoch.current

    await act(async () => { finishDelete(); await pending })

    expect(result.current.epoch.current).not.toBe(capturedByRefresh)
    expect(result.current.savedFoods).toEqual([])
  })
})

// The barcode is how the same product is recognised when a search names it in another
// language, so the star has to save it.
describe('useFavorites barcode', () => {
  it('sends the barcode when starring, and finds the favourite by it under a different name', async () => {
    const sent: Record<string, unknown>[] = []
    const spanish: SavedFood = { ...OATS, id: 9, name: 'Copos de avena', barcode: '3560071006587' }
    const api = { create: (d: Record<string, unknown>) => { sent.push(d); return Promise.resolve(spanish) }, delete: () => Promise.resolve() }
    const { result } = await renderHook(() => useFavorites(api))

    await act(async () => { await result.current.toggle({ ...oats, name: 'Copos de avena', barcode: '3560071006587' }) })

    expect(sent[0].barcode).toBe('3560071006587')
    expect(result.current.favoriteOf({ ...oats, name: 'Oat flakes', barcode: '3560071006587' })?.id).toBe(9)
  })
})

// The star answers the tap at once; a refusal puts it back and says why.
describe('useFavorites optimistic toggle', () => {
  const granola = { ...oats, name: 'Granola', brand: '' }
  const GRANOLA: SavedFood = { ...OATS, id: 7, name: 'Granola', brand: '' }
  const refuse = () => Promise.reject(new Error('down'))

  it('shows a new favourite before the server answers, then swaps in the real row', async () => {
    let finish!: (f: SavedFood) => void
    const api = { create: () => new Promise<SavedFood>(r => { finish = r }), delete: () => Promise.resolve() }
    const { result } = await renderHook(() => useFavorites(api))

    let pending!: Promise<unknown>
    await act(async () => { pending = result.current.toggle(oats) })
    expect(result.current.favoriteOf(oats)).toBeDefined()

    await act(async () => { finish(OATS); await pending })
    expect(result.current.savedFoods).toEqual([OATS])
  })

  it('takes a failed add back out and reports it', async () => {
    const { result } = await renderHook(() => useFavorites({ create: refuse, delete: () => Promise.resolve() }))

    await act(async () => { await result.current.toggle(oats) })

    expect(result.current.favoriteOf(oats)).toBeUndefined()
    expect(result.current.savedFoods).toEqual([])
    expect(result.current.error).toEqual(expect.any(String))
  })

  it('drops the row again when a reload mid-delete brought it back', async () => {
    let finishDelete!: () => void
    const api = { create: () => Promise.resolve(OATS), delete: () => new Promise<void>(r => { finishDelete = r }) }
    const { result } = await renderHook(() => useFavorites(api))
    await act(async () => { result.current.setSavedFoods([OATS]) })

    let pending!: Promise<unknown>
    await act(async () => { pending = result.current.toggle(oats) })
    await act(async () => { result.current.setSavedFoods([OATS]) })

    await act(async () => { finishDelete(); await pending })
    expect(result.current.savedFoods).toEqual([])
  })

  it('puts a failed unstar back in its place, in name order', async () => {
    // Held open so the optimistic state can be observed before the failure lands: async act()
    // would otherwise flush an immediate rejection before the assertion below.
    let failDelete!: () => void
    const held = () => new Promise<void>((_, reject) => { failDelete = () => reject(new Error('down')) })
    const { result } = await renderHook(() => useFavorites({ create: () => Promise.resolve(OATS), delete: held }))
    await act(async () => { result.current.setSavedFoods([GRANOLA, OATS]) })

    let pending!: Promise<unknown>
    await act(async () => { pending = result.current.toggle(oats) })
    expect(result.current.favoriteOf(oats)).toBeUndefined()

    await act(async () => { failDelete(); await pending })
    expect(result.current.savedFoods).toEqual([GRANOLA, OATS])
    expect(result.current.error).toEqual(expect.any(String))
    expect(result.current.favoriteOf(granola)).toBeDefined()
  })
})
