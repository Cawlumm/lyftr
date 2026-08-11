// Re-export shim — the list logic moved to @lyftr/shared as useServerList. Mobile drives
// loadMore() from FlatList's onEndReached; web wraps the same hook with an
// IntersectionObserver.
export { useServerList as useServerInfiniteList } from '@lyftr/shared'
