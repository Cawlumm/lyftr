import BarbellBrokenSVG from '../BarbellBrokenSVG'

// A figure that never arrived, in a slot too small to say so in words.
//
// The smaller end of the one failure mark. ErrorState draws BARBELL_DROPPED at 64px for a
// page and 44px for a section, both above a title and a sentence. Below that there are
// places with no room for either: a stat tile's value slot is one line of ~26px, and a
// card's content area is bigger but still not somewhere a paragraph belongs.
//
//   tile  — 26px, standing exactly where the number would have been
//   block — 44px, centred in a card or chart area whose content never arrived
//
// So a tile failure, a card failure, a section failure and a page failure are all the same
// drawing, and only the scale changes.
//
// What it deliberately does NOT do: say why. There is no room, and a truncated reason is
// worse than none. It also never renders "0" — a measurement — or a dash, which cannot be
// told apart from "nothing yet". Its only job is to stop the slot asserting a number it
// never received. The reason lives on the accessible name, and in whatever section owns it.
//
// It repeats when several tiles in a row fail, and that is intended: each tile makes its
// own claim, so each has to withdraw its own.
export default function StatFailure({
  label = "Couldn't load this figure",
  size = 'tile',
  onRetry,
}: {
  label?: string
  size?: 'tile' | 'block'
  onRetry?: () => void
}) {
  const px = size === 'block' ? 'w-11 h-11' : 'w-[26px] h-[26px]'
  const mark = <BarbellBrokenSVG className={`${px} text-[color:var(--alert-error)]`} />

  // With a retry the mark becomes the control, because in these places there is no room
  // for a button beside it and no words to hang one on. Without one it is pure status.
  if (onRetry) {
    return (
      <button
        onClick={onRetry}
        title={`${label}. Tap to try again.`}
        aria-label={`${label}. Try again.`}
        className={`inline-flex items-center justify-center rounded-lg transition-colors
          hover:bg-surface-muted/60 active:bg-surface-muted
          ${size === 'block' ? 'w-full py-6' : 'p-1 -m-1'}`}
      >
        {mark}
      </button>
    )
  }

  return (
    <span
      className={`inline-flex items-center ${size === 'block' ? 'w-full justify-center py-6' : ''}`}
      role="img"
      aria-label={label}
    >
      {mark}
    </span>
  )
}
