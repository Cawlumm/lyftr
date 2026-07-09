import { Pressable, Text } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/useTheme'

interface Props {
  label: string
  icon?: LucideIcon
  active: boolean
  onPress: () => void
  className?: string
}

// Mobile-only extraction unifying settings' UnitPill + ThemePill: a small set of
// mutually-exclusive choices where each pill carries its own selected state.
// (For a boxed, single-track control use SegmentedControl instead — pills suit 2–3
// loose options with icons.)
export function OptionPill({ label, icon: Icon, active, onPress, className = '' }: Props) {
  const { colors } = useTheme()
  // Icon stroke is an SVG prop → themed inline (documented className exception).
  const tint = active ? '#ffffff' : colors.txSecondary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (active) return
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      className={`flex-row gap-2 px-5 h-11 rounded-lg items-center justify-center active:scale-95 ${
        active ? 'bg-brand-500' : 'bg-surface-muted border border-surface-border'
      } ${className}`}
    >
      {Icon ? <Icon color={tint} size={16} strokeWidth={2.2} /> : null}
      <Text className={`font-sans-semibold text-sm ${active ? 'text-white' : 'text-tx-secondary'}`}>
        {label}
      </Text>
    </Pressable>
  )
}
