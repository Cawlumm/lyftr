import BarbellBrokenSVG from '../BarbellBrokenSVG'

// A figure that never arrived, in a slot too small to say so in words.
//
// The third size of the one failure mark. ErrorState draws BARBELL_DROPPED at 64px for a
// page and 44px for a section; a stat tile is ~110x88 and its value slot is a single line,
// so this is the same mark at 26px standing exactly where the number would have been.
// Nothing new is invented: a tile failure, a section failure and a page failure are the
// same drawing at three scales.
//
// What it deliberately does NOT do:
//
//   - It does not say why. There is no room, and a truncated reason is worse than none.
//     The section that owns the figure carries the sentence and the retry; this only has
//     to stop the tile asserting a number it never received.
//   - It does not render "0" or a dash. Those are the two readings that cost us: 0 is a
//     measurement, and a dash cannot be told apart from "nothing yet" or "zero".
//
// It repeats when several tiles in a row fail, and that is intended — each tile is making
// its own claim, so each one has to withdraw it.
export default function StatFailure({ label = "Couldn't load this figure" }: { label?: string }) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={label}>
      <BarbellBrokenSVG className="w-[26px] h-[26px] text-[color:var(--alert-error)]" />
    </span>
  )
}
