/**
 * `git describe` emits "<tag>-<commits>-g<sha>" for commits past the latest tag
 * (e.g. on :latest/main builds). Collapse that tooling output to a human-friendly
 * "<tag> (<sha>)" for display. Exact tags ("v0.1.0-beta.1") and bare commit SHAs
 * pass through unchanged.
 */
export const formatVersion = (raw: string): string => {
  const m = raw.match(/^(.+)-\d+-g([0-9a-f]+)$/)
  return m ? `${m[1]} (${m[2]})` : raw
}
