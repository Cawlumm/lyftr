import { ReactNode } from 'react'
import { View, ViewProps } from 'react-native'

interface Props extends ViewProps {
  children: ReactNode
  className?: string
}

// Card — raised surface with border, mirrors the web `.card` primitive.
export function Card({ children, className = '', ...rest }: Props) {
  return (
    <View className={`bg-surface-raised border border-surface-border rounded-xl p-4 ${className}`} {...rest}>
      {children}
    </View>
  )
}
