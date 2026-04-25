/**
 * Returns true when `s` is a string that parses to a finite, strictly positive
 * number. Use for input validation: empty / NaN / "0" / "-5" all return false.
 */
export const isPositiveNumber = (s: string): boolean => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0
}
