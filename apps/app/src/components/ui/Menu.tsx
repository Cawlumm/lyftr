import { useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { MoreVertical, type LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { ActionSheet } from './ActionSheet'
import { Icon } from './Icon'
import { touchTarget } from './interaction'
import { MENU_TRIGGER_BOX } from './overlay'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  destructive?: boolean
  /** Starts a new group: the web dropdown draws a divider above it. */
  separated?: boolean
  onSelect: () => void
}

export interface MenuProps {
  /** The trigger's accessible name; required because the default trigger is an icon. */
  label: string
  items: MenuItem[]
  /** Trigger content; a kebab icon by default. */
  children?: ReactNode
  /** Trigger box classes; a small icon-button box by default. */
  className?: string
  disabled?: boolean
  /** Which edge of the trigger the web menu lines up with. */
  align?: 'start' | 'end'
  /** ActionSheet header on native, where the menu is a sheet. */
  title?: string
  subtitle?: string
}


// On a phone a menu is a bottom sheet, so native renders the trigger over an ActionSheet.
// The web dropdown is Menu.web.tsx.
export function Menu({ label, items, children, className, disabled, title, subtitle }: MenuProps) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const hit = touchTarget(32, 32, { disabled })
  const trigger = children ?? <Icon icon={MoreVertical} size="sm" color={colors.txMuted} />
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={className === undefined ? hit.style : undefined}
        className={`active:scale-95 ${disabled ? 'opacity-40' : ''} ${className ?? ''}`}
      >
        {className === undefined ? <View className={MENU_TRIGGER_BOX}>{trigger}</View> : trigger}
      </Pressable>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        actions={items.map(i => ({ label: i.label, icon: i.icon, destructive: i.destructive, onPress: i.onSelect }))}
      />
    </>
  )
}
