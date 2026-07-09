import { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/useTheme'
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
  const { colors, accent } = useTheme()

  const tap = (delta: number) => {
    // A light tick per ± tap makes repeated stepping feel mechanical (in the good,
    // clicky-dial way); swallow the rejection where haptics don't exist (web).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onStep(delta)
  }

  const stepBtn = (delta: number, StepIcon: LucideIcon, side: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${delta < 0 ? 'Decrease' : 'Increase'} ${name}`}
      disabled={disabled}
      onPress={() => tap(delta)}
      className={`flex-1 py-2.5 items-center justify-center active:bg-surface-muted ${disabled ? 'opacity-30' : ''} ${side}`}
    >
      <StepIcon size={20} color={colors.txSecondary} strokeWidth={2.2} />
    </Pressable>
  )

  return (
    <View className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <View className="px-3 pt-3 pb-1.5 items-center gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon size={14} color={accent} strokeWidth={2.2} />
          <Label color="muted">{label}</Label>
        </View>
        {children}
      </View>
      <View className="flex-row border-t border-surface-border">
        {stepBtn(-step, Minus, 'border-r border-surface-border')}
        {stepBtn(step, Plus, '')}
      </View>
    </View>
  )
}
