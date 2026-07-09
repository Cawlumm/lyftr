import { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

type Tint = 'brand' | 'danger' | 'muted'

interface Props {
  /** Leading tinted icon chip — the row's glyph (adds scannability to a long list). */
  icon?: LucideIcon
  /** Chip/icon color family. `destructive` forces danger regardless. */
  tint?: Tint
  label: string
  /** Muted sub-label under the title (wraps). */
  description?: string
  /** Right-aligned muted current value (e.g. an email or "lbs"). Ignored if `right` is set. */
  value?: string
  /** Right-aligned control node — a Toggle, a small button. Takes precedence over `value`. */
  right?: ReactNode
  /** Full-width control rendered under the row — a SegmentedControl or stepper (avoids the
   *  native right-slot collapse that clips flex-1 controls). */
  below?: ReactNode
  onPress?: () => void
  /** Drill-in affordance. */
  chevron?: boolean
  /** Red label + red icon for delete/reset-style actions. */
  destructive?: boolean
  /** Hairline top border — set on every row but the first to divide a group. */
  divider?: boolean
}

const CHIP: Record<Tint, string> = {
  brand: 'bg-brand-500/10',
  danger: 'bg-error-500/10',
  muted: 'bg-surface-muted',
}

// The settings list-row primitive: a tinted icon chip, a label (+ optional description),
// and either a right-aligned value/control or a full-width control below. Mirrors the
// iOS/Linear row (label left · control right · chevron for drill-ins); rows are ≥52px for a
// comfortable tap target and press with a subtle fade when interactive.
export function SettingsRow({
  icon: Icon,
  tint = 'brand',
  label,
  description,
  value,
  right,
  below,
  onPress,
  chevron,
  destructive,
  divider,
}: Props) {
  const { colors, accent, brand, isDark } = useTheme()
  const isDanger = destructive || tint === 'danger'
  // errorSoft reads on dark, error on light — same split the IconButton/ConfirmSheet use.
  const iconColor = isDanger ? (isDark ? brand.errorSoft : brand.error) : tint === 'muted' ? colors.txMuted : accent
  const chip = isDanger ? CHIP.danger : CHIP[tint]

  const line = (
    <View className="flex-row items-center py-3" style={{ minHeight: 52 }}>
      {Icon ? (
        <View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${chip}`}>
          <Icon size={16} color={iconColor} strokeWidth={2.2} />
        </View>
      ) : null}
      <View className="flex-1 pr-3">
        <AppText variant="bodySemibold" className={destructive ? 'text-error-400' : ''}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="caption" color="muted" className="mt-0.5">
            {description}
          </AppText>
        ) : null}
      </View>
      {right ? right : value ? (
        <AppText variant="body" color="muted" numberOfLines={1} className="max-w-[56%]">
          {value}
        </AppText>
      ) : null}
      {chevron ? <ChevronRight size={18} color={colors.txMuted} style={{ marginLeft: 4 }} /> : null}
    </View>
  )

  return (
    <View className={divider ? 'border-t border-surface-border' : ''}>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-60">
          {line}
        </Pressable>
      ) : (
        line
      )}
      {below ? <View className="pb-3">{below}</View> : null}
    </View>
  )
}
