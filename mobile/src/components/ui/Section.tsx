import { ReactNode } from 'react'
import { View } from 'react-native'
import { Card } from './Card'
import { Label } from './Typography'

interface Props {
  label: string
  right?: ReactNode
  children: ReactNode
  className?: string
}

// Mobile-only extraction: the "Card with a muted uppercase micro-label" pattern that
// every tab screen was hand-rolling (Account / Weight unit / Today's macros / ...).
export function Section({ label, right, children, className = '' }: Props) {
  return (
    <Card className={className}>
      <View className="flex-row items-center justify-between mb-2">
        <Label>{label}</Label>
        {right ? <View>{right}</View> : null}
      </View>
      {children}
    </Card>
  )
}
