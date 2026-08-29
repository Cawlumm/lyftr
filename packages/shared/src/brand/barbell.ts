// The barbell marks, as geometry rather than as markup.
//
// The bent barbell existed twice before this — web/src/components/BarbellSVG.tsx and the
// BarbellMark inside mobile/src/components/Logo.tsx — with the same path string and the
// same eight rects typed out independently. Adding a second mark would have made four
// copies of numbers that must agree, which is the shape of every drift bug this repo has
// already paid for once (three copies of the numeric strip, two of dateUtils).
//
// React DOM and react-native-svg cannot share a component, but they can share this: the
// coordinates and which palette slot each shape uses. Each platform keeps a ~20-line
// renderer that maps a slot to a colour; nothing else about the drawing lives there.

/** Palette slots. A renderer decides what each one actually is, so the same mark can be
 *  all-white on a gradient, cyan on a chip, or muted as an error state. */
export type BarbellInk = 'bar' | 'plate' | 'plateEdge' | 'highlight' | 'collar'

export interface BarbellStroke {
  kind: 'stroke'
  d: string
  ink: BarbellInk
  width: number
  /** 'round' for a loaded bar's ends; 'butt' where the drawing wants a cut edge. */
  cap?: 'round' | 'butt'
  /** [degrees, cx, cy] — applied to this shape alone, so no renderer needs groups. */
  rotate?: readonly [number, number, number]
}

export interface BarbellFill {
  kind: 'fill'
  x: number
  y: number
  w: number
  h: number
  rx: number
  ink: BarbellInk
  opacity?: number
  /** [degrees, cx, cy] — applied to this shape alone, so no renderer needs groups. */
  rotate?: readonly [number, number, number]
}

export type BarbellShape = BarbellStroke | BarbellFill

export interface BarbellMarkData {
  viewBox: string
  shapes: readonly BarbellShape[]
}

/** One end's plate stack. `dy` shifts it onto whichever bar line the mark uses. */
const plates = (
  x: number,
  edgeX: number,
  dy = 0,
  rotate?: readonly [number, number, number],
): BarbellFill[] => [
  { kind: 'fill', x: edgeX, y: 10 + dy, w: 3, h: 18, rx: 0.8, ink: 'plateEdge', rotate },
  { kind: 'fill', x, y: 8 + dy, w: 4, h: 22, rx: 1, ink: 'plate', rotate },
  { kind: 'fill', x: x + 1.2, y: 10.5 + dy, w: 1.2, h: 17, rx: 0.5, ink: 'highlight', opacity: 0.55, rotate },
]

/** The brand mark: a bar bowing under load, plates both ends. */
export const BARBELL: BarbellMarkData = {
  viewBox: '0 0 40 40',
  shapes: [
    { kind: 'stroke', d: 'M4 16 Q20 25 36 16', ink: 'bar', width: 2.6, cap: 'round' },
    // The collar dots, drawn as circles in the original web markup. A rect whose rx is
    // half its side IS a circle in both SVG and react-native-svg, so they ride the fill
    // primitive both renderers already have rather than earning a third shape kind.
    // They were dropped when this geometry was lifted from mobile's copy, which never
    // had them — a silent change to the web logo, restored here.
    { kind: 'fill', x: 9.2, y: 17.8, w: 2, h: 2, rx: 1, ink: 'collar' },
    { kind: 'fill', x: 28.8, y: 17.8, w: 2, h: 2, rx: 1, ink: 'collar' },
    ...plates(6, 3),
    ...plates(30, 34),
  ],
}

// The failure mark: the same barbell after the lift is over.
//
// Deliberately NOT the logo with a crack in it. A logo-with-a-break reads as a damaged
// logo — the eye recognises the brand first and the fault second, and at 44px the break
// is a few pixels of nothing. This is a different composition that happens to be made of
// the same parts: the bar is TILTED rather than level, it is STRAIGHT rather than bowed
// (nothing is loading it any more — the one detail that says the lift failed rather than
// succeeded), one sleeve is BARE, and the plate that came off lies below it.
//
// So it shares the brand's vocabulary — same bar weight, same plate proportions, same
// palette — without being the brand's silhouette.
const TILT = [-16, 20, 20] as const
const FALLEN = [-6, 30, 32] as const

export const BARBELL_DROPPED: BarbellMarkData = {
  viewBox: '0 0 40 40',
  shapes: [
    // Straight, not bowed: nothing is loading it any more. That one difference is what
    // separates "the lift failed" from the logo, which bows *because* it succeeded.
    { kind: 'stroke', d: 'M7 21 L33 21', ink: 'bar', width: 2.6, cap: 'round', rotate: TILT },
    // Plates stay on both ends so the silhouette still reads "barbell" at 44px — an
    // earlier version left one sleeve bare and the whole mark read as a hammer.
    ...plates(8, 5, 2, TILT),
    // The high end is down to its last plate; the one that slid off lies below.
    { kind: 'fill', x: 30, y: 12, w: 3, h: 18, rx: 0.8, ink: 'plateEdge', rotate: TILT },
    { kind: 'fill', x: 26.5, y: 31, w: 10, h: 3.4, rx: 1.7, ink: 'plate', rotate: FALLEN },
    { kind: 'fill', x: 28, y: 31.8, w: 7, h: 1.2, rx: 0.6, ink: 'highlight', opacity: 0.5, rotate: FALLEN },
  ],
}
