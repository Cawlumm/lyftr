import { Children, ReactNode } from 'react'
import { View } from 'react-native'
import { useBreakpoint } from '../../lib/useBreakpoint'

interface Props {
  children: ReactNode
  /** Columns at base / md / lg. Defaults to 1 / 2 / 3. */
  columns?: { base?: number; md?: number; lg?: number }
  gap?: number
}

// React Native has no CSS grid, so rows wrap: each cell is padded by half the gap and the
// container pulls the outer edge back by the same amount.
export function ResponsiveGrid({ children, columns, gap = 12 }: Props) {
  const { md, lg } = useBreakpoint()
  const { base = 1, md: mdCols = 2, lg: lgCols = 3 } = columns ?? {}
  const count = lg ? lgCols : md ? mdCols : base
  const half = gap / 2
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -half }}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={{ width: `${100 / count}%`, padding: half }}>
          {child}
        </View>
      ))}
    </View>
  )
}
