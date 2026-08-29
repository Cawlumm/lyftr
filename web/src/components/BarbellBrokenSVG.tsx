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
      // Same opt-out mobile's BarbellBroken takes: on a mark painted in one flat colour
      // the specular strips are lighter streaks over the same hue, which reads as damage
      // to the drawing rather than as shine. Dropping them keeps the two platforms one mark.
      highlight={false}
      ink={{ plate: 'currentColor', plateEdge: 'currentColor', collar: 'currentColor' }}
    />
  )
}
