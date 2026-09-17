import BarbellBrokenSVG from '../BarbellBrokenSVG'

// A figure that never arrived, in a slot too small to say so in words.
//
// The smallest size of the one failure mark. ErrorState draws BARBELL_DROPPED at 64px for
// a page and 44px for a section, both above a title, a sentence and a retry — which is
// what anything card-sized or larger should use. A stat tile has none of that room: its
// value slot is a single line of about 26px. This is the same drawing at that size,
// standing exactly where the number would have been.
//
// So the rule across the app is only about room:
//   tile          → this, the mark alone
//   card or chart → ErrorState size="section": mark, sentence, button
//   whole page    → ErrorState size="page"
//
// What it deliberately does NOT do: say why, or offer a retry. There is no room for
// either, and a truncated reason is worse than none. It also never renders "0" — a
// measurement — or a dash, which cannot be told apart from "nothing yet". Its only job is
// to stop the slot asserting a number it never received; the reason rides on the
// accessible name, and the section that owns the figure carries the sentence and the way
// to recover.
//
// It repeats when several tiles in a row fail, and that is intended: each tile makes its
// own claim, so each has to withdraw its own.
export default function StatFailure({ label = "Couldn't load this figure" }: { label?: string }) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={label}>
      <BarbellBrokenSVG className="w-[26px] h-[26px] text-[color:var(--alert-error)]" />
    </span>
  )
}
