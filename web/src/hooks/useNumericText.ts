import { useEffect, useState } from 'react'

// Holds the raw typed text for a numeric field whose committed value is owned by a
// parent (which may round it, convert units, or map 0 → ''). Without this, the
// parent re-deriving `value` on every keystroke clobbers in-progress entry — a
// trailing ".", a leading "0". We re-sync from the parent only when it represents a
// genuinely *different* number than what's shown (stepper taps, programmatic
// changes, prefills); '' and 0 are treated as equivalent so a 0→'' mapping doesn't
// wipe a "0." mid-type.
//
// NOTE: we intentionally do NOT skip re-sync while focused — autofocus + a deferred
// prefill (EditWeightModal, QuickWeighInSheet) must still populate the field. The
// residual sub-0.1 mid-type snap is a limit of the 0.1-precision design (#39) + the
// underlying type=number field, not something to work around here.
export function useNumericText(value: string): [string, (next: string) => void] {
  const [text, setText] = useState(value)
  useEffect(() => {
    const a = parseFloat(text)
    const b = parseFloat(value)
    const aEmpty = Number.isNaN(a) || a === 0
    const bEmpty = Number.isNaN(b) || b === 0
    if (a !== b && !(aEmpty && bEmpty)) setText(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return [text, setText]
}
