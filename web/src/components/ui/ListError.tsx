import ErrorState from './ErrorState'

// A page of a list that never arrived.
//
// useServerList used to answer a failed fetch by setting hasMore=false, which renders
// identically to reaching the end of the data — the one outcome a reader cannot tell
// from success. So the list simply stopped, and on a flaky connection "you have 12
// workouts" and "you have 12 workouts so far" looked the same.
//
// A list failure is section-scoped, not page-scoped: the search box and the create
// button above it still work, so the state replaces the rows and nothing else. Retry
// resumes from where it stopped rather than reloading, so nothing already on screen is
// thrown away to recover the page that failed.
export default function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorState size="section" title="Couldn't load these" message={message} onRetry={onRetry} />
}
