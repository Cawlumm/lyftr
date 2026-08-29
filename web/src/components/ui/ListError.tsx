import ErrorState from './ErrorState'

// A page of a list that never arrived.
//
// useServerList still answers a failed fetch by setting hasMore=false, which renders
// identically to reaching the end of the data — the one outcome a reader cannot tell
// from success. The list simply stops, and on a flaky connection "you have 12 workouts"
// and "you have 12 workouts so far" look the same.
//
// This component is the replacement for that silence; the hook starts reporting the
// failure, and the lists start rendering this, in the lists slice. Nothing calls it yet.
//
// A list failure is section-scoped, not page-scoped: the search box and the create
// button above it still work, so the state replaces the rows and nothing else. Retry
// resumes from where it stopped rather than reloading, so nothing already on screen is
// thrown away to recover the page that failed.
export default function ListError(
  { subject, message, onRetry }: { subject: string; message: string; onRetry: () => void },
) {
  return (
    <ErrorState
      size="section"
      title={`Couldn't load ${subject}`}
      message={message}
      onRetry={onRetry}
    />
  )
}
