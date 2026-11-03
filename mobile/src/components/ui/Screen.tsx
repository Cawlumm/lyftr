import { ReactNode } from 'react'
import { Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ColumnWidth, ContentColumn } from './ContentColumn'

interface Props {
  children: ReactNode
  className?: string
  maxWidth?: ColumnWidth
}

// Screen wrapper — base surface + top safe-area padding. On web the column is centred at
// maxWidth. Only the top edge is insetted here: the bottom is owned by the tab bar (tabs)
// or the keyboard (forms).
export function Screen({ children, className = '', maxWidth }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <ContentColumn role={Platform.OS === 'web' ? 'main' : undefined} maxWidth={maxWidth} className={className}>
        {children}
      </ContentColumn>
    </SafeAreaView>
  )
}
