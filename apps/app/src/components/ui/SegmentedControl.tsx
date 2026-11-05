import { Platform, Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { touchTarget } from './interaction'

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

// `box` is the segment's smallest size, which the tap area is padded out from (a segment is
// flex-1, so its width is whatever the row gives it; sm rows of three come to about 38px).
const ITEM: Record<'sm' | 'md', { item: string; text: string; box: [number, number] }> = {
  sm: { item: 'py-1.5 rounded-md', text: 'text-xs', box: [38, 30] },
  md: { item: 'py-2.5 rounded-lg', text: 'text-sm', box: [44, 42] },
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
  const hit = touchTarget(...s.box)
  return (
    <View className={`flex-row gap-1 bg-surface-overlay rounded-xl p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            // react-native-web does not turn accessibilityState into DOM attributes, and
            // aria-selected is not valid on a button, so the chosen segment is a pressed toggle.
            {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
            onPress={() => {
              if (active) return
              // Segment switches are exactly what iOS uses selection haptics for;
              // no-ops (web) are swallowed rather than crashing the tap.
              Haptics.selectionAsync().catch(() => {})
              onChange(opt.value)
            }}
            // The active segment's border used to count toward its flex size, making it 1px wider
            // than the others; the basis (border-box, so padding included) keeps that now that the border is
            // on the inner box.
            style={active ? { ...hit.style, flexBasis: 2 + 2 * hit.style.paddingHorizontal } : hit.style}
            className={`flex-1 ${hit.outer}`}
          >
            <View
              className={`items-center justify-center ${s.item} ${
                active ? 'bg-surface-raised border border-surface-border' : 'group-hover/hit:bg-surface-raised/60'
              } ${hit.inner}`}
            >
              <Text
                className={`font-sans-semibold ${s.text} ${active ? 'text-tx-primary' : 'text-tx-muted'}`}
              >
                {opt.label}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
