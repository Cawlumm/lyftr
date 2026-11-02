import { useEffect, useRef, useState } from 'react'
import * as Haptics from 'expo-haptics'
import { useTranslation } from '@lyftr/shared'
import { useSessionKeepAwake } from '../../lib/keepAwake'
import { Toast } from '../ui/Toast'
import { useWorkoutSession } from '../../lib/lyftr'
import { useRestTimer } from '../../hooks/useRestTimer'
import { SessionPill } from './SessionPill'

// One success buzz the moment rest hits zero — you're not looking at the screen mid-
// rest, so the haptic is the cue. ISOLATED in its own null-rendering leaf: useRestTimer
// ticks (setState every ~300ms), and if that tick lived on WorkoutSessionLayer it would
// re-render <GymModeWorkout/> every tick (reloading its images + muscle diagram). Here
// the tick only re-renders this leaf, which renders nothing.
function RestOverHaptic() {
  const { done } = useRestTimer()
  const prevDone = useRef(false)
  useEffect(() => {
    if (done && !prevDone.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    prevDone.current = done
  }, [done])
  return null
}

// Always-mounted session UI layer (mirrors web's Layout): the minimized session pill
// (self-hiding). The gym overlay itself is NOT here — it renders inside the
// workouts/active screen so it sits ABOVE the tab bar (leaving tabs tappable to leave a
// running session), not over the whole device. Being a single always-mounted instance,
// this layer owns the session-wide native effects (keep-awake + rest-over haptic) so
// those fire exactly once rather than per banner/pill consumer. It deliberately does NOT
// subscribe to the ticking rest timer (that lives in the RestOverHaptic leaf).
export function WorkoutSessionLayer() {
  const { t } = useTranslation()
  const session = useWorkoutSession((s) => s.session)

  // Keep the screen on for the duration of an active session (logging between sets can
  // leave it idle past the lock timeout). Released as soon as the session ends. On web
  // this can be unavailable (plain HTTP), in which case the user is told once per session.
  const hasSession = !!session
  const screenMaySleep = useSessionKeepAwake(hasSession)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => { if (!hasSession) setDismissed(false) }, [hasSession])

  return (
    <>
      {session ? <RestOverHaptic /> : null}
      <SessionPill />
      {hasSession && screenMaySleep && !dismissed ? (
        <Toast variant="warning" title={t('workouts.keepAwakeUnavailable')} autoDismissMs={0} onDismiss={() => setDismissed(true)} />
      ) : null}
    </>
  )
}
