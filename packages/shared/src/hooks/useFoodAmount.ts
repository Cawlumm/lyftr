import { useCallback, useState } from 'react'
import type { FoodSearchResult } from '../types'
import {
  amountForServings, formatServings, servingBasis, servingsForAmount, type ServingBasis,
} from '../utils/food'

export interface FoodAmount {
  /** The field's text, as typed. A buffer, so a half-typed "0." survives. */
  text: string
  setText: (next: string) => void
  /** What a serving measures, or null when nothing knows and the field counts servings. */
  basis: ServingBasis | null
  /** What the diary stores. 0 for an empty or nonsense field — the caller blocks the log. */
  servings: number
  /** The same number, to read rather than compute with. */
  servingsLabel: number
  /** Step by one serving's worth, in whatever unit the field is showing. */
  step: (direction: 1 | -1) => void
  /** Open the field on one serving of this food. */
  openOn: (result: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>) => void
  /** Open it on the amount an existing entry recorded, in the unit it was logged in. */
  openOnEntry: (
    result: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>,
    servings: number,
  ) => void
}

// The amount field on the Log Food screen, for both apps.
//
// It is a weight or a volume when OpenFoodFacts knows what a serving measures, and a
// servings multiplier when nothing does — which is half of OpenFoodFacts and every
// hand-entered food. Either way what comes out is servings, because that is what the
// diary has always stored; the unit is a way to type one (#171, #41).
//
// Shared rather than written twice for the reason entryToResult is: this is arithmetic
// that decides how much food a person recorded, and a version of it that drifted on one
// platform would mis-log food there with nothing failing.
//
// There is deliberately no minimum. The old one was 0.5 servings, which for a bottle of
// olive oil — whose figures OpenFoodFacts holds per 100 ml — meant 50 ml was the
// smallest pour anyone could record. The server has never had a floor.
export function useFoodAmount(
  selected: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'> | null,
): FoodAmount {
  const [text, setText] = useState('1')

  const openOn = useCallback((result: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>) => {
    const b = servingBasis(result)
    setText(String(b ? b.quantity : 1))
  }, [])

  const openOnEntry = useCallback((
    result: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>,
    entryServings: number,
  ) => {
    const b = servingBasis(result)
    const s = entryServings || 1
    setText(String(b ? amountForServings(s, b) : s))
  }, [])

  const basis = selected ? servingBasis(selected) : null
  const amount = Number(text)
  const servings = Number.isFinite(amount) && amount > 0
    ? (basis ? servingsForAmount(amount, basis) : amount)
    : 0

  return {
    text,
    setText,
    basis,
    servings,
    servingsLabel: formatServings(servings),
    step: (direction) => {
      const size = basis ? basis.quantity : 0.5
      const from = Number.isFinite(amount) ? amount : 0
      setText(String(+Math.max(0, from + direction * size).toFixed(1)))
    },
    // Both openers take the food as an argument rather than reading `selected`: the
    // caller sets that in the same render, so the hook cannot see it yet. Both are
    // stable, so an effect that opens an entry for editing can depend on one without
    // re-running on every keystroke.
    openOn,
    openOnEntry,
  }
}
