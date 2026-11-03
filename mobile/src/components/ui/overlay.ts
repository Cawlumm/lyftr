// Pure geometry and key logic for the web Tooltip and Menu, kept apart from the DOM so jest can
// run it.

export type Side = 'top' | 'bottom'
export type Align = 'start' | 'center' | 'end'

interface Rect { top: number; left: number; width: number; height: number }
interface Size { width: number; height: number }

// Keeps the overlay off the viewport's edge, the way a native menu never touches the screen edge.
export const EDGE = 8

// Where an overlay goes next to its anchor: on `side` if it fits, flipped to the other side if
// only that one does (otherwise whichever has more room), and slid along the axis to stay
// inside the viewport.
export function placeOverlay(anchor: Rect, overlay: Size, viewport: Size, side: Side, align: Align, gap = 6) {
  const above = anchor.top - gap - EDGE
  const below = viewport.height - (anchor.top + anchor.height) - gap - EDGE
  const fits = (s: Side) => (s === 'top' ? above : below) >= overlay.height
  const other: Side = side === 'top' ? 'bottom' : 'top'
  const placed = fits(side) || !fits(other) && (side === 'top' ? above >= below : below >= above) ? side : other

  const top = placed === 'top' ? anchor.top - gap - overlay.height : anchor.top + anchor.height + gap
  const ideal =
    align === 'start' ? anchor.left
    : align === 'end' ? anchor.left + anchor.width - overlay.width
    : anchor.left + (anchor.width - overlay.width) / 2
  const left = Math.min(Math.max(ideal, EDGE), Math.max(EDGE, viewport.width - EDGE - overlay.width))
  return { top: Math.max(EDGE, top), left, side: placed }
}

// APG menu type-ahead: the next item after `from` whose label starts with `char`, wrapping;
// -1 when none does.
export function typeaheadIndex(labels: readonly string[], from: number, char: string) {
  const c = char.toLocaleLowerCase()
  for (let step = 1; step <= labels.length; step++) {
    const i = (from + step) % labels.length
    if (labels[i].trim().toLocaleLowerCase().startsWith(c)) return i
  }
  return -1
}
