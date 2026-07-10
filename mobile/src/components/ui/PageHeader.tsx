import { ReactNode } from 'react'
import { View } from 'react-native'
import { AppText } from './Typography'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

// Mirrors web ui/PageHeader: display-font title, optional subtitle, right-aligned
// action slot (typically an IconButton).
export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <AppText variant="title">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="muted" className="mt-0.5">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  )
}
