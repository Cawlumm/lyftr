import type { ReactNode } from 'react'
import { Modal, View } from 'react-native'
import { useIsFocused } from 'expo-router'
import { useTranslation } from '@lyftr/shared'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { useMotion } from '../../lib/useMotion'

// On web the gym overlay is a modal dialog over the whole app, as the Vite page was: RN Modal
// gives it role=dialog, aria-modal, a Tab trap, focus handed back on close, and Escape, which
// minimizes. From lg it is a centred panel rather than a phone screen stretched across a desktop.
//
// Back policy: browser Back leaves gym mode exactly as Minimize does. The session lives in the
// store, not the route, and the session pill resumes it. Back either pops /workouts/active off
// the workouts stack (unmounting this) or, when the pill brought you across tabs, refocuses the
// previous tab while this screen stays mounted. Tab screens are not unmounted on blur
// (https://reactnavigation.org/docs/navigation-lifecycle/) and a Modal portals to the body, so
// the dialog is shown only while its screen is focused, or Back would change the URL under a
// dialog that never moved.
export function GymFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const focused = useIsFocused()
  const { lg } = useBreakpoint()
  const { reduced } = useMotion()
  if (!focused) return null
  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
      {...({ 'aria-label': t('gym.workout') } as object)}
    >
      <View className={lg ? 'flex-1 items-center justify-center bg-black/60 p-6' : 'flex-1'}>
        <View
          testID="gym-panel"
          className={lg
            ? 'h-full max-h-[56rem] w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-border bg-surface-base shadow-2xl'
            : 'flex-1 bg-surface-base'}
        >
          {children}
        </View>
      </View>
    </Modal>
  )
}
