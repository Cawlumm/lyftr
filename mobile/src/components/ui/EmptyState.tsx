import { ReactNode } from 'react'
import { View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: string
  action?: ReactNode
  compact?: boolean
}

// Mirrors web ui/EmptyState: muted icon chip, centered title/subtitle, optional
// call-to-action. Use this (not a bare Muted string) whenever a list has nothing
// to show — the chip gives the empty screen enough visual weight to feel intended.
export function EmptyState({ icon: Icon, title, subtitle, action, compact = false }: Props) {
  const { colors } = useTheme()
  return (
    <View className={`items-center justify-center px-4 ${compact ? 'py-8' : 'py-12'}`}>
      <View className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border items-center justify-center mb-2 opacity-80">
        <Icon size={24} color={colors.txMuted} strokeWidth={2} />
      </View>
      <AppText variant="bodySemibold" className="text-center">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color="muted" className="mt-0.5 text-center">
          {subtitle}
        </AppText>
      ) : null}
      {action ? <View className="mt-3">{action}</View> : null}
    </View>
  )
}
