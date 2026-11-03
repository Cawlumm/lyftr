import { View } from 'react-native'
import { useBreakpoint } from '../../lib/useBreakpoint'
import type { LucideIcon } from './icons'
import { IconButton } from './IconButton'
import { Menu, type MenuItem } from './Menu'

export interface CardAction extends MenuItem {
  icon: LucideIcon
  /** The icon button's accessible name, which has no menu around it to say what it acts on. */
  namedLabel: string
}

// A list card's secondary actions on web. Below sm they fold into a kebab menu, as on a phone.
// From sm they are a row of icon buttons that a mouse reveals on hover; under a touch-only
// pointer they stay visible, and keyboard focus anywhere in the card shows them too, so tabbing
// to one never lands on something invisible. The card must carry the `group` class.
export function CardActions({ label, items, disabled }: { label: string; items: CardAction[]; disabled?: boolean }) {
  const { sm } = useBreakpoint()
  if (!sm) return <Menu label={label} items={items} disabled={disabled} />
  return (
    <View className="flex-row items-center gap-0.5 motion-safe:transition-opacity motion-safe:duration-[120ms] [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      {items.map((item) => (
        <IconButton
          key={item.namedLabel}
          icon={item.icon}
          label={item.namedLabel}
          variant={item.destructive ? 'danger' : 'ghost'}
          onPress={item.onSelect}
          disabled={disabled}
        />
      ))}
    </View>
  )
}
