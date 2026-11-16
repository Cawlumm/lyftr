import type { ReactNode } from 'react'
import { Pressable, type PressableProps, View } from 'react-native'
import type { LucideIcon } from './icons'
import { Check } from './icons'
import { AppText } from './Typography'
import { interactive, TOUCH_MIN, webToggle } from './interaction'
import { useTheme } from '../../theme/useTheme'
import { FoldToggle, OPTION_FOLD, useFold } from './fold'
import { Swatch } from './Swatch'

export interface TileOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Set elsewhere, so not choosable here, but still worth reading (the body map's main muscle
   * among the others): drawn at full contrast with a dashed edge and this colour's swatch, never
   * dimmed like an option the cap has closed. */
  locked?: { swatch: string }
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

// A choice among labelled options: one of them (radio) or any of them (checkbox). A long list
// folds by OPTION_FOLD (fold.tsx), always showing what is chosen.
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
  const fold = useFold(options, OPTION_FOLD, (o) => isOn(o.value))
  const tileStyle = { minHeight: TILE_MIN, flexBasis: `${Math.floor(100 / columns) - 3}%`, flexGrow: 1 }
  return (
    <View accessibilityRole={props.multiple ? undefined : 'radiogroup'} accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {fold.shown.map((o) => {
        const on = isOn(o.value)
        const locked = !!o.locked
        const off = (full && !on) || locked
        const Icon = o.icon
        const lead = o.locked ? <Swatch color={o.locked.swatch} /> : null
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
              style={tileStyle}
              className={`items-center justify-center gap-1.5 rounded-xl px-1 py-2 active:opacity-70 ${
                on ? 'border-2 border-brand-500 bg-brand-500/25' : 'border border-surface-border bg-surface-muted'
              } ${locked ? 'border-dashed' : interactive('hover:bg-surface-border')} ${off && !locked ? 'opacity-40' : ''}`}
            >
              {on ? (
                <View className="absolute right-1.5 top-1.5 h-4 w-4 items-center justify-center rounded-full bg-brand-500">
                  <Check size={10} color="#ffffff" strokeWidth={3.5} />
                </View>
              ) : null}
              {lead ?? (Icon ? <Icon size={26} color={on ? accent : colors.txMuted} strokeWidth={on ? 2.4 : 2} /> : null)}
              <AppText variant={on ? 'bodySemibold' : 'caption'} color={on ? 'primary' : 'secondary'} className="text-center text-[12px]" numberOfLines={2}>{o.label}</AppText>
            </Pressable>
          )
        }
        return <OptionChip key={o.value} {...common} on={on} dim={off && !locked} lead={lead} icon={Icon} label={o.label} locked={locked} />
      })}
      {fold.folds ? (
        <FoldToggle open={fold.open} hidden={fold.hidden} onPress={fold.toggle} variant={layout === 'tile' ? 'tile' : 'chip'} tileStyle={tileStyle} />
      ) : null}
    </View>
  )
}

type OptionChipProps = Omit<PressableProps, 'children'> & {
  label: string
  on: boolean
  /** Closed by a cap: drawn faded. */
  dim?: boolean
  /** Set elsewhere: dashed edge, no hover, full contrast. */
  locked?: boolean
  icon?: LucideIcon
  /** Drawn in place of the icon (a swatch). */
  lead?: ReactNode
  /** For labels held as lowercase slugs (the filter sheet's muscles): CSS capitalize. */
  capitalize?: boolean
}

// One option pill: the chip look of IconTileGroup, also used where the semantics differ (the
// filter sheet's toggle buttons), so every option chip has one size, ink and 44px target.
export function OptionChip({ label, on, dim, locked, icon: Icon, lead, capitalize, ...pressable }: OptionChipProps) {
  const { accent, colors } = useTheme()
  return (
    <Pressable
      {...pressable}
      style={{ minHeight: TOUCH_MIN }}
      className={`flex-row items-center justify-center gap-1.5 rounded-full border px-3.5 active:opacity-70 ${
        on ? 'border-brand-500 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
      } ${locked ? 'border-dashed' : interactive('hover:bg-surface-border')} ${dim ? 'opacity-40' : ''}`}
    >
      {lead ?? (Icon ? <Icon size={14} color={on ? accent : colors.txMuted} strokeWidth={2.2} /> : on ? <Check size={14} color={accent} strokeWidth={3} /> : null)}
      <AppText variant="bodySemibold" color={on ? 'primary' : 'secondary'} className={`text-[13px] ${capitalize ? 'capitalize' : ''}`}>{label}</AppText>
    </Pressable>
  )
}
