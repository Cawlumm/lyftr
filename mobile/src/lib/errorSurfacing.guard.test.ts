import { offenders } from '../testing/sourceScan'

// #145 was "the button is dead" — a request that never settled. The audit that followed found
// the quieter half of the same class: fourteen handlers that DID settle but threw the error
// away, so a timeout, a cleartext block or a bad certificate all read as "Failed to load".
// apiErrorMessage exists precisely to name those, and it cannot name what it is not given.
//
// A handler that takes no argument has nothing to grep for — `err.message` was the search that
// missed all fourteen. So the guard is on the shape instead: if a catch produces user-facing
// feedback, it must bind the error.
//
// Swallowing is still fine where nothing is shown — `Haptics.selectionAsync().catch(() => {})`
// is a genuine don't-care, and this deliberately does not flag it.

const PATTERNS = [
  // .catch(() => setError('…')) — a message with the reason discarded.
  /\.catch\(\(\)\s*=>[^\n]*set\w*Error\(/,
  // } catch {
  //   setError('…')
  /\}\s*catch\s*\{\n\s*set\w*Error\(/,
  // .catch(() => goBack()) — bounced off the screen, no explanation, nothing to retry.
  // router.replace and .push count too: the first draft of this guard listed only
  // goBack/back, and walked straight past nutrition/log.tsx, which answered a failed
  // edit-load by replacing the route. Any navigation away from the failure is the
  // same eviction — the user loses the screen and is told nothing.
  /\.catch\(\(\)\s*=>[^\n]*(goBack\(\)|router\.(back|replace|push)\()/,
]

it('never surfaces a failure it threw the cause away for', () => {
  expect(offenders(PATTERNS)).toEqual([])
})
