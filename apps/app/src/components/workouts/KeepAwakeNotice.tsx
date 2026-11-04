import { useEffect } from 'react'
import { create } from 'zustand'
import { useTranslation } from '@lyftr/shared'
import { Toast } from '../ui/Toast'

// The "screen may sleep" warning is shown from two places: WorkoutSessionLayer, and inside the
// web gym dialog, whose Modal portal would otherwise hide the layer's copy. One store holds
// the verdict, the dismissal and whether the dialog is open, so dismissing either dismisses
// both and only one is visible at a time.
interface NoticeStore {
  screenMaySleep: boolean
  dismissed: boolean
  overlayOpen: boolean
}

const useNotice = create<NoticeStore>(() => ({ screenMaySleep: false, dismissed: false, overlayOpen: false }))

export function publishKeepAwake(hasSession: boolean, screenMaySleep: boolean) {
  useNotice.setState({ screenMaySleep: hasSession && screenMaySleep, ...(hasSession ? {} : { dismissed: false }) })
}

export function KeepAwakeNotice({ inOverlay = false }: { inOverlay?: boolean }) {
  const { t } = useTranslation()
  const screenMaySleep = useNotice((s) => s.screenMaySleep)
  const dismissed = useNotice((s) => s.dismissed)
  const overlayOpen = useNotice((s) => s.overlayOpen)

  useEffect(() => {
    if (!inOverlay) return
    useNotice.setState({ overlayOpen: true })
    return () => useNotice.setState({ overlayOpen: false })
  }, [inOverlay])

  if (!screenMaySleep || dismissed || (!inOverlay && overlayOpen)) return null
  return <Toast variant="warning" title={t('workouts.keepAwakeUnavailable')} autoDismissMs={0} onDismiss={() => useNotice.setState({ dismissed: true })} />
}
