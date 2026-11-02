import type { ReactNode } from 'react'
import { Dumbbell, SearchX } from 'lucide-react'
import { exerciseCatalogEmpty, types, useTranslation } from '@lyftr/shared'
import { EmptyState, ListError } from './ui'

interface Props {
  query: string
  // True when something other than typed text narrowed the list (a filter chip). Defaults
  // to whether there is a query, which is all the picker has.
  filtered?: boolean
  // What a narrowed list that matched nothing says, when "No exercises found" is too bare.
  // A title alone is enough; the body and action say what to try.
  emptyTitle?: string
  emptyBody?: string
  // What the person can do about a narrowed list that matched nothing (drop the filters).
  emptyAction?: ReactNode
  items: readonly types.Exercise[]
  hasMore: boolean
  error: string | null
  loading: boolean
  retry: () => void
  reload: () => Promise<void>
}

// What an exercise list shows when it has no rows: a failure, an empty library, or a
// search that matched nothing. Each reads differently and only one is true.
export default function ExerciseListEmpty({ query, filtered = query !== '', emptyTitle, emptyBody, emptyAction, items, hasMore, error, loading, retry, reload }: Props) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="p-4">
        <ListError subject={t('exercises.picker.errorSubject')} message={error} onRetry={retry} />
      </div>
    )
  }

  if (exerciseCatalogEmpty(filtered, { items, hasMore, error })) {
    // reload, not retry: retry sets hasMore back to true, which would flip this to
    // "No exercises found" while the request is in flight.
    return (
      <EmptyState
        compact
        icon={Dumbbell}
        title={t('exercises.picker.catalogEmpty.title')}
        subtitle={t('exercises.picker.catalogEmpty.body')}
        action={
          <button
            type="button"
            onClick={() => { void reload() }}
            disabled={loading}
            className="btn-secondary btn-sm"
          >
            {loading ? t('common.retrying') : t('common.tryAgain')}
          </button>
        }
      />
    )
  }

  if (emptyTitle) {
    return <EmptyState compact icon={SearchX} title={emptyTitle} subtitle={emptyBody} action={emptyAction} />
  }

  return (
    <div className="flex items-center justify-center py-16 text-tx-muted text-sm">
      {t('exercises.picker.empty')}
    </div>
  )
}
