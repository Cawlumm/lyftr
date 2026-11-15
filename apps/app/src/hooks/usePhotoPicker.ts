import { useCallback } from 'react'
import { useTranslation } from '@lyftr/shared'
import { pickExercisePhoto, type ExercisePhoto, type PhotoSource } from '../lib/exercisePhoto'

export type PhotoPickOutcome = { photo: ExercisePhoto } | { error: string } | null

// Wraps pickExercisePhoto in the words a screen shows: null when the user backed out (nothing to
// say), an error sentence when permission was refused or the picture could not be read.
export function usePhotoPicker() {
  const { t } = useTranslation()
  return useCallback(async (source: PhotoSource): Promise<PhotoPickOutcome> => {
    try {
      const r = await pickExercisePhoto(source)
      if (r.status === 'picked') return { photo: r.photo }
      if (r.status === 'denied') {
        return { error: t(r.source === 'camera' ? 'exercises.custom.photo.deniedCamera' : 'exercises.custom.photo.deniedLibrary') }
      }
      return null
    } catch {
      return { error: t('exercises.custom.photo.pickFailed') }
    }
  }, [t])
}
