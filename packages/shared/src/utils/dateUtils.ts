// The one place a calendar day is produced or read on the client.
//
// The model, which is the one Fitbit, Garmin, Strava and Health Connect all use: a
// row stores the instant it happened *plus* enough to name its own day, and that day
// is never re-derived from wherever the reader happens to be standing.
//
//   diary entries (food, weight) — instant `logged_at` + stored day `logged_on`
//   workouts                     — instant `started_at` + offset `tz_offset_minutes`
//
// Two shapes because the two questions differ. A diary entry is *about* a day and the
// user picks it; a workout happened at a moment and its day follows from where that
// moment was. Fitbit splits them identically — a food log carries `logDate` with no
// time at all, an activity carries an offset inline on `startTime`.
//
// The device zone still answers exactly one question, "what day is it now", for
// `todayStr` and `daysAgoStr`. Everywhere else read the stored answer: `entryDay` and
// `workoutDay` exist so no screen has to remember which of the two shapes it holds.
//
// Instants are persisted as UTC ISO strings and rendered in the device's zone.

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

/**
 * A stored day (YYYY-MM-DD) as a local Date, for formatting it.
 *
 * Anchored at local noon so a formatter can never round or shift it across either
 * midnight, and built from explicit components for the reason dayToInstant spells out
 * above: `new Date('YYYY-MM-DDTHH:MM:SS')` is parsed as UTC by pre-iOS 14.5 Safari, so
 * every screen using that string form to render a stored day would show the next day
 * east of UTC — reintroducing, at display time, the bug this module exists to remove.
 */
export const dayToLocalDate = (yyyyMmDd: string): Date => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}
/**
 * The local calendar day `n` days before today.
 *
 * One of the only two functions here that consults the device zone, and legitimately:
 * a window bound is a question about *now*, which no stored row can answer.
 *
 * Named so range queries build their day the same way `todayStr` does. The weight
 * chart previously used date-fns `format(subDays(new Date(), n), 'yyyy-MM-dd')`, a
 * fourth path to a day string that drifts the moment anything about the other three
 * changes.
 */
export const daysAgoStr = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return instantToDay(d.toISOString())
}

/**
 * The device's UTC offset in minutes at `iso` (default: now). New York in summer is
 * -240.
 *
 * Sign is flipped from `Date.getTimezoneOffset()`, which counts minutes *behind* UTC
 * (+240 for New York) — the opposite of every other convention, including the one the
 * server stores. Resolved at the given instant rather than now, so a workout logged
 * in July keeps the summer offset even if it is saved in December.
 */
export const utcOffsetMinutes = (iso?: string): number =>
  -(iso ? new Date(iso) : new Date()).getTimezoneOffset()

/**
 * Attach the calendar day an entry belongs to, for diary writes (food, weight).
 *
 * The day is what the server files the entry under, permanently — it is never
 * re-derived from the account's zone afterwards, so travelling cannot move it. Doing
 * this once in the API layer rather than at each call site means no screen can forget
 * it: a missing `logged_on` silently falls back to the server's guess.
 */
export const withLoggedOn = <T extends { logged_at?: string }>(data: T): T & { logged_on: string } => ({
  ...data,
  logged_on: instantToDay(data.logged_at ?? new Date().toISOString()),
})

/**
 * The day a diary entry belongs to.
 *
 * Prefer the server's stored answer over re-deriving one. `instantToDay(logged_at)`
 * resolves in the *device's* zone, which stopped being the same question the moment
 * the day became a stored column: an entry filed on the 4th in New York, viewed from
 * Tokyo, re-derives as the 5th. Screens that then save that value move the entry.
 * The fallback covers responses from a server older than the column.
 */
export const entryDay = (e: { logged_on?: string; logged_at: string }): string =>
  e.logged_on || instantToDay(e.logged_at)

/**
 * The day a workout happened, from the offset recorded when it started.
 *
 * A workout stores an instant plus its offset rather than a day, so the local day is
 * recovered by applying one to the other. Reading the shifted value back in UTC is
 * correct precisely *because* the offset has already been applied — this is the one
 * place `slice(0, 10)` names a local day rather than a UTC one. Falls back to the
 * device zone for rows written before the offset existed.
 */
export const workoutDay = (w: { started_at: string; tz_offset_minutes?: number }): string => {
  if (w.tz_offset_minutes == null) return instantToDay(w.started_at)
  const shifted = new Date(new Date(w.started_at).getTime() + w.tz_offset_minutes * 60_000)
  return Number.isNaN(shifted.getTime()) ? instantToDay(w.started_at) : shifted.toISOString().slice(0, 10)
}
