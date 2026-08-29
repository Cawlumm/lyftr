import type React from 'react'
import { RotateCw } from 'lucide-react'
import BarbellBrokenSVG from '../BarbellBrokenSVG'

// A load that failed, said as a state rather than as a banner over the wreckage.
//
// Empty and error are different outcomes and the design systems that bother to separate
// them all say so (Carbon, PatternFly, the Agriculture DS). Empty means we heard back and
// there is nothing; error means we did not hear back at all. Rendering the page's
// components anyway — a KPI tile reading 0, a chart with no line — states the first while
// the second is true, and a red bar above them does not undo that. The zeros are not a
// styling problem, they are wrong.
//
// `size` follows Geist's rule: full-page when the route itself is unusable, section when
// one region inside an otherwise-working page failed. A failed workouts LIST keeps its
// search box and its "Log Workout" button, so that is a section. A failed dashboard has
// nothing truthful left to draw, so that is a page.
//
// Anatomy is the shared one: mark, Title Case title, sentence-case body, at most one
// primary action and one secondary. `message` is whatever apiErrorMessage produced, so
// the specific cause — unreachable, timed out, cleartext blocked, 5xx — is already in the
// words and does not need a second icon to encode it.
interface Props {
  /** What we were trying to load, in the app's words: "Couldn't load your dashboard". */
  title: string
  /** The cause, from apiErrorMessage. */
  message: string
  size?: 'page' | 'section'
  onRetry?: () => void
  retryLabel?: string
  /** One escape hatch at most — a link out when retrying is not the answer. */
  secondary?: React.ReactNode
}

export default function ErrorState({
  title,
  message,
  size = 'section',
  onRetry,
  retryLabel = 'Try again',
  secondary,
}: Props) {
  const page = size === 'page'
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center px-6 ${
        page ? 'min-h-[60vh] justify-center gap-3' : 'py-10 gap-2.5'
      }`}
    >
      {/* The mark carries the status colour, not the muted grey an empty state uses.
          PatternFly draws the line exactly here: icons are grey by default "except when
          used as a status icon", and it names our case — "inability to get data,
          backend failure" — as the red one. Only the mark is tinted; painting the whole
          page red would be alarming rather than legible, and the copy carries the detail. */}
      <BarbellBrokenSVG
        className={`${page ? 'w-16 h-16' : 'w-11 h-11'} text-[color:var(--alert-error)]`}
      />
      <div className="space-y-1 max-w-sm">
        <p className={`font-display font-bold text-tx-primary ${page ? 'text-xl' : 'text-base'}`}>
          {title}
        </p>
        <p className="text-sm text-tx-muted leading-relaxed">{message}</p>
      </div>
      {(onRetry || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          {onRetry && (
            <button onClick={onRetry} className="btn-primary btn-sm flex items-center gap-1.5">
              <RotateCw className="w-3.5 h-3.5" /> {retryLabel}
            </button>
          )}
          {secondary}
        </div>
      )}
    </div>
  )
}
