import { ReactNode } from 'react'
import { Platform, View, ViewProps } from 'react-native'

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
