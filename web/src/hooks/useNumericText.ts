import { useEffect, useState } from 'react'

// Holds the raw typed text for a numeric field whose committed value is owned by a
// parent (which may round it, convert units, or map 0 → ''). Without this, the
// parent re-deriving `value` on every keystroke clobbers in-progress entry — a
// trailing ".", a leading "0", or (in gym mode, which round-trips through 0.1-grid
// display units) any value finer than the display precision.
//
// While the field is focused we never overwrite what the user is typing; on blur we
// re-sync to the parent's canonical value. When unfocused we still re-sync only for
// a genuinely *different* number (stepper taps, programmatic changes), treating ''
// and 0 as equivalent so a 0→'' mapping doesn't wipe a "0." mid-type.
export function useNumericText(value: string, isFocused = false): [string, (next: string) => void] {
  const [text, setText] = useState(value)
  useEffect(() => {
    if (isFocused) return // don't clobber active typing; blur re-runs this and syncs
    const a = parseFloat(text)
    const b = parseFloat(value)
    const aEmpty = Number.isNaN(a) || a === 0
    const bEmpty = Number.isNaN(b) || b === 0
    if (a !== b && !(aEmpty && bEmpty)) setText(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused])
  return [text, setText]
}
