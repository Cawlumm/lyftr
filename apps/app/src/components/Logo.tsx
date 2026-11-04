import Svg, { Path, Rect } from 'react-native-svg'
import { BARBELL, type BarbellInk, type BarbellMarkData } from '@lyftr/shared'

// Renders a barbell mark from shared geometry. The coordinates used to live here AND in
// web/src/components/BarbellSVG.tsx — the same path string and the same eight rects,
// typed out twice — so they now come from packages/shared/src/brand/barbell.ts and this
// file is only the react-native-svg half of the drawing.
//
// The colour props are kept as they were: AuthScaffold renders this all-white on the
// gradient and cyan-on-glass in the same screen, so the palette has to stay per-call.
export function BarbellMark({
  size = 34,
  mark = BARBELL,
  bar = '#ffffff',
  plate = '#00b8d9',
  plateEdge = '#0891b2',
  highlight = true,
}: {
  size?: number
  mark?: BarbellMarkData
  bar?: string
  plate?: string
  plateEdge?: string
  highlight?: boolean
}) {
  const ink: Record<BarbellInk, string> = { bar, plate, plateEdge, highlight: '#7eeeff', collar: '#475569' }
  const spin = (r?: readonly [number, number, number]) =>
    r ? { transform: `rotate(${r[0]} ${r[1]} ${r[2]})` } : {}

  return (
    <Svg width={size} height={size} viewBox={mark.viewBox}>
      {mark.shapes.map((s, i) => {
        if (s.kind === 'stroke') {
          return (
            <Path
              key={i}
              d={s.d}
              fill="none"
              stroke={ink[s.ink]}
              strokeWidth={s.width}
              strokeLinecap={s.cap ?? 'round'}
              {...spin(s.rotate)}
            />
          )
        }
        // `highlight={false}` drops the specular strips — wanted for the flat all-white
        // watermark, where they would read as a seam rather than as a shine.
        if (s.ink === 'highlight' && !highlight) return null
        return (
          <Rect
            key={i}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={s.rx}
            fill={ink[s.ink]}
            opacity={s.opacity}
            {...spin(s.rotate)}
          />
        )
      })}
    </Svg>
  )
}
