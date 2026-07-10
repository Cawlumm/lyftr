import { Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: readonly Option<T>[] | Option<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}

const ITEM: Record<'sm' | 'md', { item: string; text: string }> = {
  sm: { item: 'py-1.5 rounded-md', text: 'text-xs' },
  md: { item: 'py-2.5 rounded-lg', text: 'text-sm' },
}

// Mirrors web ui/SegmentedControl: pill container on the overlay surface, active
// segment raised with a border. Generic over the value type so `onChange` stays
// narrow at call sites.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: Props<T>) {
  const s = ITEM[size]
  return (
    <View className={`flex-row gap-1 bg-surface-overlay rounded-xl p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return
              // Segment switches are exactly what iOS uses selection haptics for;
              // no-ops (web) are swallowed rather than crashing the tap.
              Haptics.selectionAsync().catch(() => {})
              onChange(opt.value)
            }}
            className={`flex-1 items-center justify-center ${s.item} ${
              active ? 'bg-surface-raised border border-surface-border' : ''
            }`}
          >
            <Text
              className={`font-sans-semibold ${s.text} ${active ? 'text-tx-primary' : 'text-tx-muted'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
