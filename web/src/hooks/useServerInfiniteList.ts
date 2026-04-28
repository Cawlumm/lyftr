import { useState, useEffect, useRef, useCallback } from 'react'

interface Options<T> {
  fetcher: (offset: number, limit: number) => Promise<T[]>
  pageSize?: number
  rootMargin?: string
  // Changing any dep resets the list and re-fetches from offset 0 (e.g. search query)
  deps?: readonly unknown[]
}

interface Result<T> {
  items: T[]
  sentinelRef: React.RefObject<HTMLDivElement>
  hasMore: boolean
  loading: boolean
  // True only during the very first fetch — use for full-page spinners
  initialLoading: boolean
  // Call after create/delete to discard loaded items and re-fetch from scratch
  reload: () => void
}

export function useServerInfiniteList<T>({
  fetcher,
  pageSize = 20,
  rootMargin = '200px',
  deps = [],
}: Options<T>): Result<T> {
  const [items, setItems] = useState<T[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Tracks whether a fetch is in flight to prevent double-fetches
  const fetchingRef = useRef(false)
  // Incremented by reload() to force a reset even if deps haven't changed
  const [resetKey, setResetKey] = useState(0)
  // Flips true after first fetch completes — never resets — drives initialLoading
  const initializedRef = useRef(false)

  const fetchPage = useCallback(async (currentOffset: number, replace: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    try {
      const page = await fetcher(currentOffset, pageSize)
      setItems(prev => replace ? page : [...prev, ...page])
      setOffset(currentOffset + page.length)
      setHasMore(page.length === pageSize)
      initializedRef.current = true
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [fetcher, pageSize])

  // Reset and fetch from scratch when deps or resetKey change
  useEffect(() => {
    setItems([])
    setOffset(0)
    setHasMore(true)
    fetchingRef.current = false
    fetchPage(0, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, resetKey])

  // Sentinel intersection → load next page
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && hasMore && !fetchingRef.current) {
          fetchPage(offset, false)
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, offset, fetchPage, rootMargin])

  const reload = useCallback(() => setResetKey(k => k + 1), [])

  return { items, sentinelRef, hasMore, loading, initialLoading: loading && !initializedRef.current, reload }
}
