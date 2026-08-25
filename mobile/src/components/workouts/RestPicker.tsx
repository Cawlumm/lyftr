import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Clock, Minus, Pencil, Plus, TimerOff } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'

interface Props {
  value: number
  onChange: (secs: number) => void
}

const PRESETS = [0, 60, 90, 120, 180]
const SEGMENTS: { v: number; label: string; Icon: LucideIcon }[] = [
  { v: 0, label: 'Off', Icon: TimerOff },
  { v: 60, label: '60s', Icon: Clock },
  { v: 90, label: '90s', Icon: Clock },
  { v: 120, label: '120s', Icon: Clock },
  { v: 180, label: '180s', Icon: Clock },
]

const clamp = (n: number) => Math.max(0, Math.min(3600, n))

// Port of web/components/RestPicker.tsx: one connected segmented bar (Off · presets ·
// Custom); Custom reveals a ±5 seconds row. Hand-rolled rather than
// ui/SegmentedControl — that primitive has no icon slot and can't express the sticky
// Custom segment (active while `value` is non-preset OR the user just tapped it).
// Haptics follow the kit idioms: selection tick per segment, light impact per ± step.
// The seconds TextInput has no focus-reactive styling → no re-render on focus
// (Fabric-safe by construction).
export function RestPicker({ value, onChange }: Props) {
  const { colors } = useTheme()
  const isCustom = !PRESETS.includes(value)
  const [showCustom, setShowCustom] = useState(false)
  const customActive = isCustom || showCustom

  const pick = (v: number) => {
    Haptics.selectionAsync().catch(() => {})
    setShowCustom(false)
    onChange(v)
  }
  const step = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onChange(clamp(value + delta))
  }

  // RN has no divide-x: every segment but the last carries a right border.
  const seg = (active: boolean, last = false) =>
    `flex-1 items-center justify-center gap-1 py-2 ${last ? '' : 'border-r border-surface-border'} ${
      active ? 'bg-brand-500' : 'bg-surface-muted'
    }`
  const segText = (active: boolean) =>
    `font-sans-semibold text-[11px] ${active ? 'text-white' : 'text-tx-secondary'}`

  return (
    <View>
      <View className="flex-row overflow-hidden rounded-xl border border-surface-border">
        {SEGMENTS.map(({ v, label, Icon }) => {
          const active = !customActive && value === v
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => pick(v)}
              className={seg(active)}
            >
              <Icon size={13} color={active ? '#ffffff' : colors.txSecondary} strokeWidth={2.2} />
              <Text className={segText(active)}>{label}</Text>
            </Pressable>
          )
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: customActive }}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {})
            setShowCustom(true)
          }}
          className={seg(customActive, true)}
        >
          <Pencil size={13} color={customActive ? '#ffffff' : colors.txSecondary} strokeWidth={2.2} />
          <Text className={segText(customActive)}>{isCustom ? `${value}s` : 'Custom'}</Text>
        </Pressable>
      </View>

      {customActive && (
        <View className="mt-3 flex-row items-center justify-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minus 5 seconds"
            onPress={() => step(-5)}
            className="rounded-xl border border-surface-border bg-surface-muted p-2.5 active:scale-95"
          >
            <Minus size={16} color={colors.txSecondary} />
          </Pressable>
          <View className="h-11 w-28 flex-row items-center rounded-lg border border-surface-border bg-surface-overlay px-3">
            <TextInput
              value={String(value)}
              onChangeText={(raw) => onChange(clamp(Number(raw.replace(/[^0-9]/g, '')) || 0))}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              accessibilityLabel="Rest seconds"
              placeholderTextColor={colors.txMuted}
              className="flex-1 py-0 text-center font-sans-semibold text-base text-tx-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            />
            <Text className="font-sans text-xs text-tx-muted">sec</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plus 5 seconds"
            onPress={() => step(5)}
            className="rounded-xl border border-surface-border bg-surface-muted p-2.5 active:scale-95"
          >
            <Plus size={16} color={colors.txSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  )
}
