import { useRef, useState } from 'react'
import { apiErrorMessage } from '../client'
import type { FoodSearchResult, SavedFood } from '../types'
import { findSavedFood, normaliseFoodKey } from '../utils/food'

/** The slice of the saved-foods API a toggle needs; both apps pass their client's. */
export interface SavedFoodsApi {
  create: (data: Record<string, unknown>) => Promise<SavedFood>
  delete: (id: number) => Promise<unknown>
}

export interface Favorites {
  /** The favourites list. The caller loads it; toggles keep it current. */
  savedFoods: SavedFood[]
  setSavedFoods: React.Dispatch<React.SetStateAction<SavedFood[]>>
  /** The saved row for this food, if it is a favourite. */
  favoriteOf: (item: FoodSearchResult) => SavedFood | undefined
  /** This food's star has a request in flight. Dim it; don't block the others. */
  isToggling: (item: FoodSearchResult) => boolean
  /** Star or unstar. Resolves to what happened, or null if it failed or was ignored. */
  toggle: (item: FoodSearchResult) => Promise<'added' | 'removed' | null>
  /**
   * The sentence to show when a toggle failed, in the server's words.
   *
   * Only read this where exactly one food is on screen (a food's own detail page). In a
   * LIST, use errorFor: a star that failed halfway down the diary reports it at the top
   * of the page, which is off-screen the moment anyone has scrolled — the repo's own rule
   * is that a banner above a scrolled list says nothing.
   */
  error: string | null
  setError: (error: string | null) => void
  /** The failed-toggle sentence, but only for the food whose star actually failed. */
  errorFor: (item: Pick<FoodSearchResult, 'name' | 'brand'>) => string | null
  /**
   * Bumped when a toggle starts and again when it settles. A list load captures it and
   * drops its own result if it moved while the load was in flight — otherwise a refresh
   * issued just before a DELETE resolves comes back holding the row, puts the unstarred
   * food back on screen, and the next tap deletes an id the server no longer has. The
   * bump on settling is what catches that one: the refresh started *after* the toggle
   * began, so only the toggle's end can move the value it captured.
   */
  epoch: React.MutableRefObject<number>
}

const keyOf = (item: FoodSearchResult) => `${normaliseFoodKey(item.name)}|${normaliseFoodKey(item.brand)}`

// Favouriting is its own action, not a side effect of logging: one tap on, one tap off,
// from any row, the food detail, or a diary entry. No confirmation — a second tap undoes
// it. One implementation for every screen that shows a star (#138), so the rules below
// cannot hold on one screen and drift on another.
export function useFavorites(api: SavedFoodsApi): Favorites {
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([])
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  // The message and the food it belongs to move together, so a list can put the sentence
  // on the row that was tapped instead of above the whole list. One failure is tracked,
  // not a map: a toggle clears it before starting, so only the most recent can be shown.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const epoch = useRef(0)
  const error = failure?.message ?? null
  const setError = (message: string | null) =>
    setFailure(message === null ? null : { key: '', message })

  // The guard is a ref, not the state above. setState does not apply within the tick it
  // is called in, so a burst of taps in one frame all read the same empty set and all
  // fire — five rapid taps sent one DELETE that worked and four that 404'd, then showed
  // "Couldn't remove …" for an unstar that had actually succeeded. The state exists only
  // to dim the star; the ref is what decides.
  const inFlight = useRef<Set<string>>(new Set())

  // Derived from the list rather than tracked, so a star tapped anywhere is reflected
  // everywhere the same food appears.
  const favoriteOf = (item: FoodSearchResult) => findSavedFood(savedFoods, item)
  const isToggling = (item: FoodSearchResult) => toggling.has(keyOf(item))
  const errorFor = (item: Pick<FoodSearchResult, 'name' | 'brand'>) =>
    failure && failure.key === keyOf(item as FoodSearchResult) ? failure.message : null

  const toggle = async (item: FoodSearchResult): Promise<'added' | 'removed' | null> => {
    const key = keyOf(item)
    // Guard this food only. A single global flag dropped taps on *other* rows while a
    // request was in flight, so on a slow connection every other star went dead with no
    // feedback — indistinguishable from a broken button.
    if (inFlight.current.has(key)) return null
    inFlight.current.add(key)
    setToggling(new Set(inFlight.current))
    setError(null)
    epoch.current += 1
    const existing = favoriteOf(item)
    try {
      if (existing) {
        await api.delete(existing.id)
        setSavedFoods(prev => prev.filter(f => f.id !== existing.id))
        return 'removed'
      }
      const created = await api.create({
        name: item.name, brand: item.brand ?? '',
        calories: item.calories, protein: item.protein,
        carbs: item.carbs, fat: item.fat, fiber: item.fiber ?? 0,
        serving_size: item.serving_size ?? '',
      })
      // The server answers 200 with the existing row when the food is already favourited,
      // so `created` can be something the list already holds — after a refresh that raced
      // this request, for instance. Appending blind puts two rows with the same id (and the
      // same React key) in the list.
      // Inserted in name order rather than appended: ListSaved returns ORDER BY name, so
      // appending parks a new favourite at the bottom until the next load and then jumps
      // it. Plain < to match SQLite's BINARY collation rather than localeCompare, which
      // would order differently from the server it is imitating.
      setSavedFoods(prev => prev.some(f => f.id === created.id)
        ? prev
        : [...prev, created].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)))
      return 'added'
    } catch (err) {
      setFailure({
        key,
        message: apiErrorMessage(err, existing
          ? `Couldn't remove ${item.name} from Favorites.`
          : `Couldn't add ${item.name} to Favorites.`),
      })
      return null
    } finally {
      epoch.current += 1
      inFlight.current.delete(key)
      setToggling(new Set(inFlight.current))
    }
  }

  return { savedFoods, setSavedFoods, favoriteOf, isToggling, toggle, error, setError, errorFor, epoch }
}
