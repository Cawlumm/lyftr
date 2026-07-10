// Port of web/src/hooks/useServerInfiniteList.ts — keep in sync.
// RN adaptation: no IntersectionObserver here, so the web's sentinelRef becomes an
// explicit loadMore() the screen wires to FlatList onEndReached. Offset lives in a
// ref (loadMore reads it directly) instead of state feeding an observer effect.
//
// One deliberate divergence from web: neither reload() NOR a deps change (search)
// hard-clears the list. Both refetch page 0 and swap the results in place, so the
// summary/cards never flash to empty — on focus-return or while typing a query the
// current results stay put until the fresh page arrives. A deps change also sets
// `refreshing` so the screen can show a subtle "searching" cue over the stale list.
import { useState, useEffect, useRef, useCallback } from 'react'

interface Options<T> {
  fetcher: (offset: number, limit: number) => Promise<T[]>
  pageSize?: number
  // Changing any dep resets the list and re-fetches from offset 0 (e.g. search query)
  deps?: readonly unknown[]
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
}

export function useServerInfiniteList<T>({
  fetcher,
  pageSize = 20,
  deps = [],
}: Options<T>): Result<T> {
  const [items, setItems] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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
      setItems(prev => (replace ? page : [...prev, ...page]))
      offsetRef.current = currentOffset + page.length
      setHasMore(page.length === pageSize)
    } catch {
      // Web lets rejections escape (harmless in a browser); on RN an unhandled
      // rejection is red-box noise — keep what loaded and stop paginating instead.
      if (myId === reqIdRef.current) setHasMore(false)
    } finally {
      // Only the latest fetch owns the shared flags — a stale response bows out without
      // flipping loading/fetching out from under the request that superseded it.
      if (myId === reqIdRef.current) {
        initializedRef.current = true
        fetchingRef.current = false
        setLoading(false)
      }
    }
  }, [fetcher, pageSize])

  // Deps change (e.g. the search query): reset pagination and refetch page 0, but keep
  // the previous results on screen until the fresh page replaces them (stale-while-
  // revalidate) so the list/summary never flash to empty. `refreshing` drives the
  // screen's "searching" cue over the stale list; it clears when the fetch settles.
  useEffect(() => {
    offsetRef.current = 0
    setHasMore(true)
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

  return { items, loadMore, hasMore, loading, initialLoading: loading && !initializedRef.current, refreshing, reload }
}
