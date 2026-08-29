import { BARBELL_DROPPED } from '@lyftr/shared'
import { BarbellMark } from './BarbellSVG'

// The mark for "we could not load this": the barbell after the lift is over — bar tilted
// and straight (nothing is loading it), one sleeve bare, the plate that came off lying
// beneath it. Geometry is shared with the logo in packages/shared; only the palette
// differs here, muted so this reads as a state rather than as branding on a failed screen.
export default function BarbellBrokenSVG({ className = '' }: { className?: string }) {
  return (
    <BarbellMark
      mark={BARBELL_DROPPED}
      className={className}
      ink={{ plate: 'currentColor', plateEdge: 'currentColor', highlight: 'currentColor' }}
    />
  )
}
