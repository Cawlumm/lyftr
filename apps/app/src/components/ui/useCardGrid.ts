import { Platform, type ViewStyle } from 'react-native'
import { useBreakpoint } from '../../lib/useBreakpoint'

// Columns for a FlatList of cards: a grid from lg on web, the phone's single column everywhere
// else (native tablets included, so no device's layout changes). FlatList cannot change
// numColumns in place, hence the key. A cell has a fixed share of the row rather than flex: 1,
// or a lone card on the last row would stretch across all of it.
export function useCardGrid(columns: { lg: number; xl?: number }, gap = 12) {
  const { lg, xl } = useBreakpoint()
  const wide = Platform.OS === 'web' && lg
  const n = !wide ? 1 : xl ? (columns.xl ?? columns.lg) : columns.lg
  if (n === 1) return { wide, numColumns: 1, key: 'cols-1' }
  return {
    wide,
    numColumns: n,
    key: `cols-${n}`,
    columnWrapperStyle: { gap } as ViewStyle,
    // calc() is not a DimensionValue; react-native-web passes it through.
    cellStyle: { width: `calc((100% - ${(n - 1) * gap}px) / ${n})` } as unknown as ViewStyle,
  }
}
