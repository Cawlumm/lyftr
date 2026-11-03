import { ReactNode } from 'react'
import { Platform, StyleProp, View, ViewProps, ViewStyle } from 'react-native'

export type ColumnWidth = 'narrow' | 'default' | 'wide' | 'full'

const MAX_WIDTH: Record<ColumnWidth, string> = {
  narrow: 'max-w-xl',
  default: 'max-w-3xl',
  wide: 'max-w-6xl',
  full: '',
}

interface Props extends Pick<ViewProps, 'role'> {
  children: ReactNode
  maxWidth?: ColumnWidth
  className?: string
}

export function ContentColumn({ children, maxWidth = 'default', className = '', role }: Props) {
  // The centring classes are added on web only, so a phone (and a native tablet) renders
  // exactly what it did before this component existed.
  const web = Platform.OS === 'web' ? `mx-auto w-full ${MAX_WIDTH[maxWidth]}` : ''
  return (
    <View role={role} className={`flex-1 px-5 ${web} ${className}`.replace(/  +/g, ' ')}>
      {children}
    </View>
  )
}

// Spread on a screen's vertical scroller. The column keeps the content at its max width, but a
// wheel or trackpad only scrolls what is under the pointer, so a scroller as narrow as the
// column leaves dead gutters either side of it. This widens the scroller to the whole row
// (margin out, padding back in) while its content box stays exactly the column. 50% is the
// column's own width and 50vw half the window, so the box grows by exactly the margin it takes
// back as padding (nothing moves at phone widths). Native gets no style. calc() is not a DimensionValue, hence the cast.
export const scrollBleed: StyleProp<ViewStyle> =
  Platform.OS === 'web'
    ? ({ marginHorizontal: 'calc(50% - 50vw)', paddingHorizontal: 'calc(50vw - 50%)' } as unknown as ViewStyle)
    : undefined
