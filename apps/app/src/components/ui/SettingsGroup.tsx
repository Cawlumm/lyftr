import { ReactNode } from 'react'
import { View } from 'react-native'
import { Card } from './Card'
import { AppText } from './Typography'

interface Props {
  /** Uppercase section header, rendered in the margin *above* the card (iOS grouped style). */
  title?: string
  /** Muted helper text under the card — for explaining a whole group. */
  footnote?: string
  children: ReactNode
  className?: string
}

// iOS-style grouped settings section: a margin header, a rounded card holding the rows,
// and an optional footnote beneath. The card drops its vertical padding so `SettingsRow`s
// sit edge-to-edge and manage their own rhythm + hairline dividers; horizontal padding is
// kept so row content stays inset from the card edge.
export function SettingsGroup({ title, footnote, children, className = '' }: Props) {
  return (
    <View className={className}>
      {title ? (
        <AppText variant="caption" color="muted" className="mb-2 ml-1 uppercase tracking-wider">
          {title}
        </AppText>
      ) : null}
      <Card className="py-0">{children}</Card>
      {footnote ? (
        <AppText variant="caption" color="muted" className="mt-2 ml-1 leading-4">
          {footnote}
        </AppText>
      ) : null}
    </View>
  )
}
