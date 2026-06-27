/**
 * Returns true when `s` is a string that parses *cleanly* to a finite, strictly
 * positive number. Use for input validation: empty / NaN / "0" / "-5" / "5abc"
 * all return false.
 *
 * Uses `Number()`, not `parseFloat()`: parseFloat reads a leading number and
 * ignores trailing junk ("5abc" -> 5), which would wrongly accept malformed
 * weight input. Number() rejects any trailing non-numeric characters while still
 * tolerating surrounding whitespace.
 */
export const isPositiveNumber = (s: string): boolean => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0
}
