import type { BarbellInk, BarbellMarkData } from '@lyftr/shared'
import { BARBELL } from '@lyftr/shared'

// Renders a barbell mark from shared geometry. The coordinates live in
// packages/shared/src/brand/barbell.ts because this file and mobile's BarbellMark used to
// carry the same path string and the same eight rects, typed out twice.
//
// `ink` maps a palette slot to a colour, so one drawing serves the logo (brand cyan, bar
// in currentColor) and the error state (muted, so it reads as a state and not as branding).
const DEFAULT_INK: Record<BarbellInk, string> = {
  bar: 'currentColor',
  plate: '#00b8d9',
  plateEdge: '#0891b2',
  highlight: '#7eeeff',
  collar: '#475569',
}

const spin = (r?: readonly [number, number, number]) =>
  r ? { transform: `rotate(${r[0]} ${r[1]} ${r[2]})` } : {}

export function BarbellMark({
  mark = BARBELL,
  ink,
  className = '',
  width,
  height,
  highlight = true,
}: {
  mark?: BarbellMarkData
  ink?: Partial<Record<BarbellInk, string>>
  className?: string
  width?: number
  height?: number
  /** Specular strips. Off for a flat monochrome mark, where they read as a seam
   *  rather than a shine — mobile's BarbellMark takes the same opt-out. */
  highlight?: boolean
}) {
  const paint = { ...DEFAULT_INK, ...ink }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={mark.viewBox}
      width={width}
      height={height}
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      {mark.shapes.filter(s => highlight || s.ink !== 'highlight').map((s, i) =>
        s.kind === 'stroke' ? (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={paint[s.ink]}
            strokeWidth={s.width}
            strokeLinecap={s.cap ?? 'round'}
            {...spin(s.rotate)}
          />
        ) : (
          <rect
            key={i}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={s.rx}
            fill={paint[s.ink]}
            opacity={s.opacity}
            {...spin(s.rotate)}
          />
        ),
      )}
    </svg>
  )
}

/** The brand mark at its original fixed size, for the logo lockup. */
export default function BarbellSVG() {
  return <BarbellMark width={40} height={40} />
}
