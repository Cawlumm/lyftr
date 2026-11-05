import { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Minus, Plus } from './icons'
import type { LucideIcon } from './icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { touchTarget } from './interaction'
import { Label } from './Typography'

interface Props {
  icon: LucideIcon
  label: string
  /** Concise metric name for the step buttons' accessibility labels (e.g. "reps"). */
  name: string
  step: number
  onStep: (delta: number) => void
  disabled?: boolean
  /** The value field (a NumberField) shown between header and footer. */
  children: ReactNode
}

// Mirrors web ui/StepperTile: a metric tile — icon header, a full-width value field,
// and a split decrement/increment footer — so reps + weight entry share one layout.
// Not built on Card: the ± footer needs edge-to-edge buttons, which Card's p-4 padding
// would fight.
export function StepperTile({
  icon: Icon,
  label,
  name,
  step,
  onStep,
  disabled = false,
  children,
}: Props) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  // Full width, so only the 40px height is padded out.
  const stepHit = touchTarget(158, 40, { disabled, inset: true })

  const tap = (delta: number) => {
    // A light tick per ± tap makes repeated stepping feel mechanical (in the good,
    // clicky-dial way); swallow the rejection where haptics don't exist (web).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onStep(delta)
  }

  const stepBtn = (delta: number, StepIcon: LucideIcon, side: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(delta < 0 ? 'common.stepper.decrease' : 'common.stepper.increase', { name })}
      disabled={disabled}
      onPress={() => tap(delta)}
      // The button is 40px tall and flush with the tile, so it is padded out 2px past it; the
      // tile therefore does not clip, and each button rounds its own outer corner.
      // The minus's divider used to count toward its flex size (1px), as the border now sits on the inner box.
      style={delta < 0 ? { ...stepHit.style, flexBasis: 1 } : stepHit.style}
      className={`flex-1 ${stepHit.outer}`}
    >
      <View className={`py-2.5 items-center justify-center group-active/hit:bg-surface-muted ${disabled ? 'opacity-30' : 'group-hover/hit:bg-surface-muted'} ${stepHit.inner} ${side}`}>
        <StepIcon size={20} color={colors.txSecondary} strokeWidth={2.2} />
      </View>
    </Pressable>
  )

  return (
    <View className="bg-surface-raised border border-surface-border rounded-xl">
      <View className="px-3 pt-3 pb-1.5 items-center gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon size={14} color={accent} strokeWidth={2.2} />
          <Label color="muted">{label}</Label>
        </View>
        {children}
      </View>
      <View className="flex-row border-t border-surface-border">
        {stepBtn(-step, Minus, 'border-r border-surface-border rounded-bl-xl')}
        {stepBtn(step, Plus, 'rounded-br-xl')}
      </View>
    </View>
  )
}
