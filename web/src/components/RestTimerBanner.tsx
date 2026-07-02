import { useCallback } from 'react'
import { Pause, Play, SkipForward, Check } from 'lucide-react'
import { useWorkoutSession } from '../stores/workoutSession'
import { useRestTimer } from '../hooks/useRestTimer'
import { fmtClock, nextIncompleteSet } from '../utils/workoutSets'
import { IconButton } from './ui'

// Hevy/Strong-style rest panel: a thin draining progress line, a big centred
// countdown with a pause/resume toggle, and full-width −15/+15/Skip actions.
// Shown only INSIDE the workout — DOCKED in-flow at the bottom of the gym set screen
// (pushes the set content up instead of covering it) and FLOATING above the gym
// overview/exercise-info screens. When the workout is minimized the countdown moves
// to a compact chip in the session pill (see Layout's ActiveSessionBar) instead of
// following you around the app. Haptics/sound are left to a future native app.
export default function RestTimerBanner({ docked = false }: { docked?: boolean }) {
  const {
    restEndsAt, restDurationSec, restPausedRemainingMs, restExIdx, restSetIdx,
    session, adjustRest, clearRest, pauseRest, resumeRest,
  } = useWorkoutSession()
  const { active, paused, done, left } = useRestTimer()

  // Drain the progress line over the *actual* remaining time (one linear CSS
  // transition), not stepping per second. A callback ref (not an effect) so it
  // fires on the real mount — the bar only renders after restEndsAt is set, which
  // an effect keyed on restEndsAt would miss. Re-armed when the ref identity
  // changes (start, ±15s, pause/resume — restPausedRemainingMs is in the deps).
  const setupLine = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const total = Math.max(1, (restDurationSec ?? 0) * 1000)
    // Paused: freeze the line at the parked fraction, no transition.
    if (restPausedRemainingMs != null) {
      el.style.transition = 'none'
      el.style.width = `${Math.min(100, (restPausedRemainingMs / total) * 100)}%`
      return
    }
    if (restEndsAt == null) return
    const remaining = Math.max(0, restEndsAt - Date.now())
    el.style.transition = 'none'
    el.style.width = `${Math.min(100, (remaining / total) * 100)}%`
    void el.offsetWidth // reflow so the next change animates from here
    el.style.transition = `width ${remaining}ms linear`
    el.style.width = '0%'
  }, [restEndsAt, restDurationSec, restPausedRemainingMs])

  // Hidden when no rest is running or paused (auto-dismiss lives in useRestTimer).
  if (!active) return null

  // Set ↔ timer linkage (Hevy-style): the store records which set started this rest
  // (restExIdx/restSetIdx = the just-completed set); label the panel with that set
  // + the next incomplete one (mirrors gym-mode's auto-advance) so it's clear which
  // set is resting and which is up next.
  const restEx = restExIdx != null ? session?.exercises[restExIdx] : undefined
  const nextIdx = restEx != null && restSetIdx != null ? nextIncompleteSet(restEx.sets, restSetIdx) : -1
  const doneSetNum = restEx != null && restSetIdx != null ? restSetIdx + 1 : null
  const label = doneSetNum == null
    ? (done ? 'Rest over' : paused ? 'Paused' : 'Rest')
    : done
      ? (nextIdx !== -1 ? `Rest over · set ${nextIdx + 1} next` : 'Rest over')
      : paused
        ? `Set ${doneSetNum} done · paused`
        : nextIdx !== -1
          ? `Set ${doneSetNum} done · set ${nextIdx + 1} next`
          : `Set ${doneSetNum} done · resting`

  const secBtn = 'flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold tabular-nums bg-surface-muted border border-surface-border text-tx-secondary active:scale-95'
  const brandBtn = 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white active:scale-95'

  const body = (
    <>
      {/* draining count-down line */}
      {done ? (
        <div className="h-1 bg-success-500" />
      ) : (
        <div className="h-1 bg-surface-muted">
          <div ref={setupLine} className="h-full rounded-r-full bg-brand-500" />
        </div>
      )}
      <div className="px-4 pt-2 pb-3">
        <p className="text-[11px] font-medium text-tx-muted text-center leading-none">{label}</p>
        {/* big countdown + pause/resume toggle (the panel's signature element) */}
        <div className="flex items-center justify-center gap-3 my-2">
          {done ? (
            <Check className="w-7 h-7 text-success-500" />
          ) : (
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? 'Resume rest timer' : 'Pause rest timer'}
              onClick={paused ? resumeRest : pauseRest}
              variant="ghost" size="lg"
              className="!text-brand-500 hover:!text-brand-500"
            />
          )}
          <span className="font-display text-4xl font-black tabular-nums text-tx-primary leading-none">{fmtClock(left)}</span>
        </div>
        {/* full-width actions */}
        {done ? (
          <button onClick={() => clearRest()} className={brandBtn}><Check className="w-4 h-4" />Done</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => adjustRest(-15)} aria-label="Shorten rest by 15 seconds" className={secBtn}>−15</button>
            <button onClick={() => adjustRest(15)} aria-label="Extend rest by 15 seconds" className={secBtn}>+15</button>
            <button onClick={() => clearRest()} className={brandBtn}><SkipForward className="w-4 h-4" />Skip</button>
          </div>
        )}
      </div>
    </>
  )

  // Docked: an in-flow block at the bottom of the gym set column, so the flex
  // layout pushes the set content up above it (nothing is covered).
  if (docked) {
    return (
      <div className="flex-shrink-0 bg-surface-raised border-t border-surface-border animate-slide-up">
        <div className="max-w-md mx-auto">{body}</div>
      </div>
    )
  }
  // Floating: above the tab bar on every other screen (e.g. gym minimized).
  return (
    <div className="fixed bottom-24 inset-x-3 z-[70] mx-auto max-w-md animate-slide-up">
      <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden shadow-lg">{body}</div>
    </div>
  )
}
