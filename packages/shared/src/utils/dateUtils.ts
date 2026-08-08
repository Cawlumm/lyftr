// Date helpers for the local-time write / UTC-store pattern used by the weight
// feature. Ported verbatim from web/src/utils/dateUtils.ts so web and mobile share
// one implementation.
//
// Storage convention: timestamps are persisted as UTC ISO strings.
// Display convention: rendered in the device's local timezone.
// Date-only fields ("the date this entry is *for*"): anchored at local noon so the
// entry's calendar day is robust across all plausible timezone offsets (±12h).

/** Today's calendar date as YYYY-MM-DD in the device's local timezone. */
export const todayStr = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}



/**
 * The calendar day an instant falls on, in the device's local timezone.
 *
 * The inverse of `dayToInstant`, and the read half of the same loop: load an entry,
 * show its day in a date field, save the picked day back as an instant. The pair is
 * lossy in one direction only — this discards the time, which is why the other one
 * takes the previous timestamp to put it back.
 */
export const instantToDay = (iso: string): string => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The instant to store for a user-picked calendar day. The inverse of
 * `instantToDay`.
 *
 * One rule for every date the user chooses, replacing the four this codebase grew:
 * a fake noon anchor, a bare `new Date(ymd)` (which parses as UTC midnight and put
 * west-of-UTC users on the previous day), a real `new Date()`, and a local
 * keep-the-time helper that existed in exactly one screen.
 *
 * `previousIso` is the entry's current timestamp when editing: the day moves and the
 * time-of-day is preserved, so re-dating an entry doesn't silently restamp when it
 * happened. Without it the time defaults to local noon — furthest from either
 * midnight, so the entry stays on the intended day under any offset the server might
 * later resolve it in.
 *
 * Built from explicit components rather than `new Date('YYYY-MM-DDTHH:MM:SS')`:
 * pre-iOS 14.5 Safari parsed that string form as UTC, the same class of bug this
 * function exists to remove.
 */
export const dayToInstant = (yyyyMmDd: string, previousIso?: string): string => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const prev = previousIso ? new Date(previousIso) : null
  const valid = prev && !Number.isNaN(prev.getTime())
  return new Date(
    y, (m ?? 1) - 1, d ?? 1,
    valid ? prev.getHours() : 12,
    valid ? prev.getMinutes() : 0,
    valid ? prev.getSeconds() : 0,
    0,
  ).toISOString()
}
