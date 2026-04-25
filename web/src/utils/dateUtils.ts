/**
 * Date helpers for the local-time write / UTC-store pattern used by the
 * weight feature.
 *
 * Storage convention: timestamps are persisted as UTC ISO strings.
 * Display convention: rendered in the browser's local timezone.
 * Date-only fields ("the date this entry is *for*"): we anchor at local noon
 * so the entry's calendar day is robust across all plausible timezone offsets.
 */

/** Today's calendar date as YYYY-MM-DD in the browser's local timezone. */
export const todayStr = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Convert a YYYY-MM-DD calendar date to an ISO timestamp anchored at the
 * user's local noon, then expressed in UTC. Noon-anchoring keeps the entry
 * on the intended calendar day for every timezone within ±12h.
 *
 * Built without `new Date('YYYY-MM-DDTHH:MM:SS')` because old mobile Safari
 * (pre-iOS 14.5) parsed that as UTC instead of local; the explicit-component
 * constructor is locale-safe everywhere.
 */
export const dayToIsoNoon = (yyyyMmDd: string): string => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}

/**
 * Extract a YYYY-MM-DD string in the browser's local timezone from any ISO
 * timestamp. Use this to populate `<input type="date">` fields when editing
 * an existing entry so the displayed date matches what the user originally
 * picked.
 */
export const isoToDayInput = (iso: string): string => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
