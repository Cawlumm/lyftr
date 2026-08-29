import { BARBELL_DROPPED } from '@lyftr/shared'
import { BarbellMark } from '../Logo'

// The mark for "we could not load this": the barbell after the lift is over — bar tilted
// and straight (nothing is loading it), one end down to its last plate, and the plate that
// slid off lying below. Geometry is shared with the logo in packages/shared, and the
// renderer is the same BarbellMark the logo uses; only the palette differs, muted so this
// reads as a state rather than as branding on a failed screen.
export function BarbellBroken({ size = 44, color = '#94a3b8' }: { size?: number; color?: string }) {
  return (
    <BarbellMark
      size={size}
      mark={BARBELL_DROPPED}
      bar={color}
      plate={color}
      plateEdge={color}
      highlight={false}
    />
  )
}
