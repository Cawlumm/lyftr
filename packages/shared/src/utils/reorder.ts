// Moving one exercise to another position (#166). The workout, routine and live-session
// editors all reorder through these, so "where does index i end up" has one answer.

/** `list` with the item at `from` moved to `to`. Out-of-range or no-op moves return `list` itself. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const n = list.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return list as T[]
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Where the item that was at `index` sits after `moveItem(list, from, to)`. Positional
 *  state that points into the list (the focused exercise, a running rest timer) follows
 *  the exercise it belonged to rather than whatever lands in its old slot. */
export function remapIndex(index: number, from: number, to: number): number {
  if (index === from) return to
  if (from < index && index <= to) return index - 1
  if (to <= index && index < from) return index + 1
  return index
}

/** React keys for a list of exercise ids that survive a reorder. An id alone is not
 *  enough when a routine lists the same exercise twice; the occurrence count keeps
 *  those apart. Index keys would hand one card's local state (an open note, a typed
 *  buffer) to whichever exercise moves into its slot. */
export function occurrenceKeys(ids: readonly number[]): string[] {
  const seen = new Map<number, number>()
  return ids.map((id) => {
    const n = seen.get(id) ?? 0
    seen.set(id, n + 1)
    return `${id}:${n}`
  })
}

/** How fast to scroll a list while a row is dragged near one of its edges, in px per second:
 *  negative toward the top, positive toward the bottom, 0 outside the edge bands. Speed grows
 *  linearly with how deep the pointer is in a band and is `max` at (or past) the edge itself,
 *  so a finger held above or below the list keeps it moving. The bands shrink on a short list
 *  so they never meet in the middle. */
export function autoScrollSpeed(
  pointerY: number, top: number, bottom: number, edge = 56, max = 900,
): number {
  const band = Math.min(edge, (bottom - top) / 3)
  if (!(band > 0)) return 0
  const intoTop = top + band - pointerY
  if (intoTop > 0) return -max * Math.min(1, intoTop / band)
  const intoBottom = pointerY - (bottom - band)
  if (intoBottom > 0) return max * Math.min(1, intoBottom / band)
  return 0
}
