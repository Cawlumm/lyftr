import { useCallback, useEffect, useRef } from 'react'
import { useServerList } from '@lyftr/shared'

// Web's pagination trigger on top of the shared list state.
//
// The list logic (offset paging, the request-race guard, stale-while-revalidate) lives
// in @lyftr/shared; the only web-specific part is HOW loadMore gets called — an
// IntersectionObserver on a sentinel element the caller renders at the end of the list.
// React Native drives the same hook from FlatList's onEndReached instead.
//
// Adopting the shared version changes two things for the better on web:
//  - a slow response for an old search query can no longer overwrite a newer one
//  - changing the query no longer blanks the list while the new page loads
export function useServerInfiniteList<T>({
  fetcher,
  pageSize = 20,
  rootMargin = '200px',
  deps = [],
}: {
  fetcher: (offset: number, limit: number) => Promise<T[]>
  pageSize?: number
  rootMargin?: string
  deps?: readonly unknown[]
}) {
  const list = useServerList<T>({ fetcher, pageSize, deps })
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const { loadMore, hasMore } = list
  const onIntersect = useCallback<IntersectionObserverCallback>(
    (entries) => { if (entries[0]?.isIntersecting) loadMore() },
    [loadMore],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(onIntersect, { rootMargin })
    obs.observe(el)
    return () => obs.disconnect()
  }, [onIntersect, hasMore, rootMargin])

  return { ...list, sentinelRef }
}
