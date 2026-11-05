import type { TFunction } from 'i18next'

// Only completed sets are saved, so both layouts' Finish sheets say what is dropped, or offer Discard when nothing is done.
export function finishConfirmCopy(t: TFunction, done: number, total: number) {
  if (done === 0) {
    return {
      nothingToSave: true,
      title: t('workouts.active.nothingToSave.title'),
      message: t('workouts.active.nothingToSave.message'),
      confirmLabel: t('workouts.start.discard'),
    }
  }
  const unfinished = total - done
  return {
    nothingToSave: false,
    title: t('workouts.active.finishConfirm.title'),
    message: unfinished > 0
      ? t('workouts.active.finishConfirm.unfinished', { done, total, count: unfinished })
      : t('workouts.active.finishConfirm.message', { done, count: total }),
    confirmLabel: t('workouts.active.finish'),
  }
}
