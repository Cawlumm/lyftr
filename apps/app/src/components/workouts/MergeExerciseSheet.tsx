import { useEffect, useState } from 'react'
import { Merge } from '../ui/icons'
import {
  apiErrorMessage, useTranslation,
  type Exercise, type ExerciseMergeResult, type ExerciseUsage,
} from '@lyftr/shared'
import { ConfirmSheet } from '../ui'
import { client } from '../../lib/lyftr'
import { ExercisePicker } from './ExercisePicker'

interface Props {
  source: Exercise
  open: boolean
  onClose: () => void
  onMerged: (result: ExerciseMergeResult) => void
}

// Two steps: pick the exercise to merge into, then a confirm that says exactly what moves (the
// counts come from the server) and that it cannot be undone. A failure stays in the confirm so
// the retry is under the finger that tapped.
export function MergeExerciseSheet({ source, open, onClose, onMerged }: Props) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<Exercise | null>(null)
  const [usage, setUsage] = useState<ExerciseUsage | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setTarget(null); setBusy(false); setError(null) }
  }, [open])

  useEffect(() => {
    setUsage(null)
    setUsageError(null)
    if (!open || !target) return
    let cancelled = false
    client.exerciseAPI.usage(source.id)
      .then((u) => { if (!cancelled) setUsage(u) })
      .catch((err) => { if (!cancelled) setUsageError(apiErrorMessage(err, t('exercises.custom.merge.usageFailed'))) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target, source.id])

  const confirm = async () => {
    if (!target || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await client.exerciseAPI.merge(source.id, target.id)
      onMerged(result)
    } catch (err) {
      setError(apiErrorMessage(err, t('exercises.custom.merge.failed')))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  if (!target) {
    return (
      <ExercisePicker
        selectedIds={[source.id]}
        title={t('exercises.custom.merge.pickerTitle', { name: source.name })}
        allowCreate={false}
        onSelect={setTarget}
        onClose={onClose}
      />
    )
  }

  const message = usage
    ? [
        t('exercises.custom.merge.body', {
          from: source.name,
          into: target.name,
          workouts: t('exercises.custom.merge.workouts', { count: usage.workouts }),
          programDays: t('exercises.custom.merge.programDays', { count: usage.program_days }),
        }),
        t('exercises.custom.merge.final', { from: source.name }),
      ].join(' ')
    : t('exercises.custom.merge.counting')

  return (
    <ConfirmSheet
      open
      destructive
      icon={Merge}
      title={t('exercises.custom.merge.confirmTitle', { name: target.name })}
      message={message}
      confirmLabel={t('exercises.custom.merge.confirm')}
      busy={busy}
      confirmDisabled={!usage}
      error={error ?? usageError ?? undefined}
      onConfirm={() => { void confirm() }}
      onCancel={() => setTarget(null)}
    />
  )
}
