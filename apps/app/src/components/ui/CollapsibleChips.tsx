import type { ReactNode } from 'react'
import { CHIP_FOLD, FoldToggle, useFold } from './fold'

interface Props<T> {
  items: readonly T[]
  renderChip: (item: T) => ReactNode
  /** Beside small read-only badges: the toggle draws as a badge, its tap area still 44px tall. */
  compact?: boolean
}

// A wrapping chip row that folds by CHIP_FOLD (see fold.tsx). Render it inside the caller's
// flex-wrap row: it returns the chips themselves, not a container.
export function CollapsibleChips<T>({ items, renderChip, compact = false }: Props<T>) {
  const fold = useFold(items, CHIP_FOLD)
  return (
    <>
      {fold.shown.map(renderChip)}
      {fold.folds ? <FoldToggle open={fold.open} hidden={fold.hidden} onPress={fold.toggle} variant={compact ? 'badge' : 'chip'} /> : null}
    </>
  )
}
