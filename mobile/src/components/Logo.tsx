import Svg, { Path, Rect } from 'react-native-svg'

// The web app's "bent barbell" mark (bar bowing under load, plates each end).
// Ported from web/public/favicon + BarbellSVG. Colors are parameterized so it reads
// on gradient (all white), on a glass chip (cyan plates), or as a watermark.
export function BarbellMark({
  size = 34,
  bar = '#ffffff',
  plate = '#00b8d9',
  plateEdge = '#0891b2',
  highlight = true,
}: {
  size?: number
  bar?: string
  plate?: string
  plateEdge?: string
  highlight?: boolean
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M4 16 Q20 25 36 16" fill="none" stroke={bar} strokeWidth={2.6} strokeLinecap="round" />
      <Rect x={3} y={10} width={3} height={18} rx={0.8} fill={plateEdge} />
      <Rect x={6} y={8} width={4} height={22} rx={1} fill={plate} />
      <Rect x={34} y={10} width={3} height={18} rx={0.8} fill={plateEdge} />
      <Rect x={30} y={8} width={4} height={22} rx={1} fill={plate} />
      {highlight ? (
        <>
          <Rect x={7.2} y={10.5} width={1.2} height={17} rx={0.5} fill="#7eeeff" opacity={0.55} />
          <Rect x={31.6} y={10.5} width={1.2} height={17} rx={0.5} fill="#7eeeff" opacity={0.55} />
        </>
      ) : null}
    </Svg>
  )
}
