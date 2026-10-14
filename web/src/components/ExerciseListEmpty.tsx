import { Dumbbell } from 'lucide-react'
import { exerciseCatalogEmpty, types, useTranslation } from '@lyftr/shared'
import { EmptyState, ListError } from './ui'

interface Props {
  query: string
  items: readonly types.Exercise[]
  hasMore: boolean
  error: string | null
  loading: boolean
  retry: () => void
  reload: () => Promise<void>
}

// What an exercise list shows when it has no rows: a failure, an empty library, or a
// search that matched nothing. Each reads differently and only one is true.
export default function ExerciseListEmpty({ query, items, hasMore, error, loading, retry, reload }: Props) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="p-4">
        <ListError subject={t('exercises.picker.errorSubject')} message={error} onRetry={retry} />
      </div>
    )
  }

  if (exerciseCatalogEmpty(query, { items, hasMore, error })) {
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

  return (
    <div className="flex items-center justify-center py-16 text-tx-muted text-sm">
      {t('exercises.picker.empty')}
    </div>
  )
}
