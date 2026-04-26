import { useState, useEffect, useRef } from 'react'

interface Options {
  /**
   * Total length of the underlying list. The hook clamps `visibleCount` so it
   * never exceeds this and resets paging when the list shrinks (e.g. deletes).
   */
  total: number
  /**
   * How many items to reveal per page. Default 30.
   */
  pageSize?: number
  /**
   * Pixel margin around the viewport at which the sentinel is considered
   * "visible" — letting the next page load before the user reaches the very
   * end. Default 200px.
   */
  rootMargin?: string
}

/**
 * Generic frontend-only infinite-scroll for an already-fetched list.
 *
 * Use this when the data is already in memory (e.g. a single API call returned
 * the full list, or a reasonable upper bound) and you just want to render in
 * pages so the DOM stays light. Attach `sentinelRef` to a placeholder element
 * at the bottom of the list — when it scrolls into view, `visibleCount` bumps
 * by `pageSize`.
 *
 * For server-side cursor pagination, pair this with a separate fetcher that
 * appends to the underlying list when `visibleCount` approaches `total`.
 *
 * Returns:
 *   - visibleCount: number of items to render (use `list.slice(0, visibleCount)`)
 *   - sentinelRef:  ref to attach to the bottom-of-list sentinel element
 *   - hasMore:      whether there are still hidden items
 */
export function useInfiniteList({ total, pageSize = 30, rootMargin = '200px' }: Options) {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Bump on intersection.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(c => Math.min(c + pageSize, total))
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [total, pageSize, rootMargin])

  // Clamp when the list shrinks.
  useEffect(() => {
    setVisibleCount(c => Math.max(pageSize, Math.min(c, total)))
  }, [total, pageSize])

  return {
    visibleCount,
    sentinelRef,
    hasMore: visibleCount < total,
  }
}
