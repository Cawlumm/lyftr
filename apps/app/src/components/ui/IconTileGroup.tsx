import { Pressable, View } from 'react-native'
import type { LucideIcon } from './icons'
import { Check } from './icons'
import { AppText } from './Typography'
import { interactive, TOUCH_MIN, webToggle } from './interaction'
import { useTheme } from '../../theme/useTheme'

export interface TileOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Shown but not choosable (the body map's main muscle among the others). */
  disabled?: boolean
}

type Props<T extends string> = {
  options: readonly TileOption<T>[]
  /** Names the group for a screen reader. */
  label: string
  /** `tile`: icon over label in a grid. `chip`: a wrapping row of pills. */
  layout?: 'tile' | 'chip'
  /** Tile columns. */
  columns?: number
} & (
  | { multiple?: false; value: T | null; onChange: (value: T) => void }
  | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void; /** At most this many; the rest are disabled once reached. */ max?: number }
)

const TILE_MIN = 76

// A choice among a few labelled options: one of them (radio) or any of them (checkbox).
export function IconTileGroup<T extends string>(props: Props<T>) {
  const { options, label, layout = 'chip', columns = 3 } = props
  const { accent, colors } = useTheme()
  const isOn = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v)
  const press = (v: T) => {
    if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v])
    else props.onChange(v)
  }
  const role = props.multiple ? 'checkbox' : 'radio'
  const full = props.multiple && props.max !== undefined && props.value.length >= props.max
  return (
    <View accessibilityRole={props.multiple ? undefined : 'radiogroup'} accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const on = isOn(o.value)
        const off = (full && !on) || !!o.disabled
        const Icon = o.icon
        const common = {
          accessibilityRole: role,
          accessibilityState: { checked: on, disabled: off },
          disabled: off,
          accessibilityLabel: o.label,
          onPress: () => press(o.value),
          ...webToggle(on, () => { if (!off) press(o.value) }),
        } as const
        if (layout === 'tile') {
          return (
            <Pressable
              key={o.value}
              {...common}
              style={{ minHeight: TILE_MIN, flexBasis: `${Math.floor(100 / columns) - 3}%`, flexGrow: 1 }}
              className={`items-center justify-center gap-1.5 rounded-xl px-1 py-2 active:opacity-70 ${
                on ? 'border-2 border-brand-500 bg-brand-500/25' : 'border border-surface-border bg-surface-muted'
              } ${off ? 'opacity-40' : ''} ${interactive('hover:bg-surface-border')}`}
            >
              {on ? (
                <View className="absolute right-1.5 top-1.5 h-4 w-4 items-center justify-center rounded-full bg-brand-500">
                  <Check size={10} color="#ffffff" strokeWidth={3.5} />
                </View>
              ) : null}
              {Icon ? <Icon size={26} color={on ? accent : colors.txMuted} strokeWidth={on ? 2.4 : 2} /> : null}
              <AppText variant={on ? 'bodySemibold' : 'caption'} color={on ? 'primary' : 'secondary'} className="text-center text-[12px]" numberOfLines={2}>{o.label}</AppText>
            </Pressable>
          )
        }
        return (
          <Pressable
            key={o.value}
            {...common}
            style={{ minHeight: TOUCH_MIN }}
            className={`flex-row items-center justify-center gap-1.5 rounded-full border px-3.5 active:opacity-70 ${
              on ? 'border-brand-500 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
            } ${off ? 'opacity-40' : ''} ${interactive('hover:bg-surface-border')}`}
          >
            {Icon ? <Icon size={14} color={on ? accent : colors.txMuted} strokeWidth={2.2} /> : on ? <Check size={14} color={accent} strokeWidth={3} /> : null}
            <AppText variant="bodySemibold" color={on ? 'primary' : 'secondary'} className="text-[13px]">{o.label}</AppText>
          </Pressable>
        )
      })}
    </View>
  )
}
