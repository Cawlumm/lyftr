// Offset-paginated list state against a server fetcher, shared by both apps.
//
// Pagination is driven by an explicit loadMore() rather than a scroll sentinel, because
// the trigger is the one genuinely platform-specific part: React Native wires it to
// FlatList onEndReached, the web wraps this with an IntersectionObserver (see
// web/src/hooks/useServerInfiniteList.ts).
//
// Two behaviours here that web's own copy lacked before this moved:
//
//  - A monotonic request id. Responses that do not match the latest id are dropped, so a
//    slow request for an old query ("a") cannot overwrite the results of a newer one
//    ("ab") when they resolve out of order — the classic search race. Web had no guard
//    at all, so typing quickly could leave stale results on screen for good.
//  - Rejections are caught. Web let them escape, which is merely noisy in a browser but
//    a red box on RN; either way the list now keeps what loaded and stops paginating.
//
// Neither reload() nor a deps change hard-clears the list: both refetch page 0 and swap
// the results in place, so the list never flashes empty while typing a query or after a
// delete. `refreshing` marks the deps-change case so a screen can show a subtle cue over
// the stale results.
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiErrorMessage } from '../client'

interface Options<T> {
  fetcher: (offset: number, limit: number) => Promise<T[]>
  pageSize?: number
  // Changing any dep resets the list and re-fetches from offset 0 (e.g. search query)
  deps?: readonly unknown[]
  // Shown when the server gives us nothing better to say.
  errorFallback?: string
}

interface Result<T> {
  items: T[]
  // Wire to FlatList onEndReached — no-ops while a fetch is in flight or when done.
  loadMore: () => void
  hasMore: boolean
  loading: boolean
  // True only during the very first fetch — use for the initial spinner
  initialLoading: boolean
  // True while a deps change (e.g. a new search query) is re-fetching page 0 with the
  // previous results still on screen — drive a subtle "searching" indicator with this.
  refreshing: boolean
  // Background revalidate: refetch page 0 and swap in place (keeps current items
  // visible meanwhile). Call on focus / after a mutation without an empty flash.
  // Background revalidate; returns the fetch promise so a caller (e.g. pull-to-refresh)
  // can await completion to drive its own spinner.
  reload: () => Promise<void>
  // Why the last fetch failed, or null. A page that never arrived used to just set
  // hasMore=false, so the list stopped exactly like a list that had reached its end —
  // the one shape a reader cannot tell from success. Render it, with retry().
  error: string | null
  // Resume from wherever we stopped. Keeps whatever already loaded.
  retry: () => void
}

export function useServerList<T>({
  fetcher,
  pageSize = 20,
  deps = [],
  errorFallback = "Couldn't load this list.",
}: Options<T>): Result<T> {
  const [items, setItems] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)
  // Tracks whether a fetch is in flight to prevent double-fetches (onEndReached can
  // fire repeatedly during momentum scrolling)
  const fetchingRef = useRef(false)
  // Flips true after first fetch settles — never resets — drives initialLoading
  const initializedRef = useRef(false)
  // Monotonic id stamped on each fetch. Responses that don't match the latest id are
  // ignored, so a slow request for an old query (e.g. "a") can't overwrite the results
  // of a newer one ("ab") when they resolve out of order — the classic search race.
  const reqIdRef = useRef(0)

  const fetchPage = useCallback(async (currentOffset: number, replace: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    const myId = ++reqIdRef.current
    setLoading(true)
    try {
      const page = await fetcher(currentOffset, pageSize)
      if (myId !== reqIdRef.current) return // superseded by a newer fetch — drop it
      // A response that is not a list takes the whole app down, not just this list:
      // the spread below throws, React unmounts the tree, and with no error boundary
      // anywhere the screen goes white — no nav, nothing to click, dead until a manual
      // reload. Measured with {"data": null} and with {} from a stubbed endpoint, which
      // is what a half-deployed backend or a proxy in front of the wrong service sends.
      //
      // Reported as a failure rather than coerced to []: an empty array here would draw
      // "No workouts found", which is the same lie about the user's data that the rest
      // of this work exists to remove.
      if (!Array.isArray(page)) {
        if (myId === reqIdRef.current) {
          setHasMore(false)
          setError('The server sent something we could not read.')
        }
        return
      }
      setError(null)
      setItems(prev => (replace ? page : [...prev, ...page]))
      offsetRef.current = currentOffset + page.length
      setHasMore(page.length === pageSize)
    } catch (err) {
      // Web lets rejections escape (harmless in a browser); on RN an unhandled
      // rejection is red-box noise — keep what loaded and stop paginating instead.
      //
      // Stopping quietly was the whole bug: hasMore=false renders exactly like
      // reaching the end of the data, so a dropped connection looked like "that is
      // all there is". Name it and let the screen offer retry().
      if (myId === reqIdRef.current) {
        setHasMore(false)
        setError(apiErrorMessage(err, errorFallback))
      }
    } finally {
      // Only the latest fetch owns the shared flags — a stale response bows out without
      // flipping loading/fetching out from under the request that superseded it.
      if (myId === reqIdRef.current) {
        initializedRef.current = true
        fetchingRef.current = false
        setLoading(false)
      }
    }
  }, [fetcher, pageSize, errorFallback])

  // Deps change (e.g. the search query): reset pagination and refetch page 0, but keep
  // the previous results on screen until the fresh page replaces them (stale-while-
  // revalidate) so the list/summary never flash to empty. `refreshing` drives the
  // screen's "searching" cue over the stale list; it clears when the fetch settles.
  useEffect(() => {
    offsetRef.current = 0
    setHasMore(true)
    setError(null)
    fetchingRef.current = false
    setRefreshing(true)
    fetchPage(0, true).finally(() => setRefreshing(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps])

  const loadMore = useCallback(() => {
    if (!hasMore || fetchingRef.current) return
    fetchPage(offsetRef.current, false)
  }, [hasMore, fetchPage])

  // Soft/background reload: fetchPage(0, replace) swaps the fresh page in on arrival
  // without a preceding setItems([]) — no empty flash. offset/hasMore are reset by
  // the fetch itself on success.
  const reload = useCallback(() => fetchPage(0, true), [fetchPage])

  // Resume, rather than reload: the pages already on screen are fine, it was the next
  // one that never came. hasMore has to go back up first — loadMore checks it, and the
  // failure is what set it false.
  const retry = useCallback(() => {
    setError(null)
    setHasMore(true)
    fetchPage(offsetRef.current, offsetRef.current === 0)
  }, [fetchPage])

  return {
    items, loadMore, hasMore, loading,
    initialLoading: loading && !initializedRef.current,
    refreshing, reload, error, retry,
  }
}
