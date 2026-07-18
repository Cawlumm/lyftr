import { ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface Props {
  children: ReactNode
  className?: string
}

// Screen wrapper — base surface + top safe-area padding. Only the top edge is
// insetted here: the bottom is owned by the tab bar (tabs) or the keyboard (forms).
export function Screen({ children, className = '' }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className={`flex-1 px-5 ${className}`}>{children}</View>
    </SafeAreaView>
  )
}
