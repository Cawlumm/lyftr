import { ReactNode } from 'react'
import { View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

interface Props {
  icon?: LucideIcon
  title: string
  right?: ReactNode
  className?: string
}

// Mirrors web ui/SectionHeader: brand-tinted icon + small semibold title, optional
// right slot (count badge, "See all" link, ...).
export function SectionHeader({ icon: Icon, title, right, className = '' }: Props) {
  // lucide icons are SVG — stroke color is a native prop NativeWind can't set, so it
  // comes from the theme (the documented className exception). `accent` keeps the
  // cyan legible on both light and dark surfaces.
  const { accent } = useTheme()
  return (
    <View className={`flex-row items-center justify-between ${className}`}>
      <View className="flex-row items-center gap-2">
        {Icon ? <Icon size={15} color={accent} strokeWidth={2.2} /> : null}
        <AppText variant="subheading">{title}</AppText>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  )
}
