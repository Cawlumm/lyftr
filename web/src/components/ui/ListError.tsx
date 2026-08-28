import { AlertCircle, RotateCw } from 'lucide-react'

// A page of a list that never arrived.
//
// useServerList used to answer a failed fetch by setting hasMore=false, which renders
// identically to reaching the end of the data — the one outcome a reader cannot tell
// from success. So the list simply stopped, and on a flaky connection "you have 12
// workouts" and "you have 12 workouts so far" looked the same.
//
// Retry resumes from where it stopped rather than reloading, so nothing already on
// screen is thrown away to recover the page that failed.
export default function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert-error flex-col sm:flex-row sm:items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-sm">{message}</span>
      <button
        onClick={onRetry}
        className="btn-secondary btn-sm flex-shrink-0 self-start sm:self-auto"
      >
        <RotateCw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  )
}
