import type { TFunction } from 'i18next'

// One reading of the Finish sheet for both layouts. Only completed sets are saved, so the
// copy says what will be dropped; with nothing done the sheet offers Discard instead.
export function finishConfirmCopy(t: TFunction, done: number, total: number) {
  if (done === 0) {
    return {
      nothingToSave: true,
      title: t('workouts.active.nothingToSave.title'),
      message: t('workouts.active.nothingToSave.message'),
      confirmLabel: t('gym.discard.confirm'),
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
