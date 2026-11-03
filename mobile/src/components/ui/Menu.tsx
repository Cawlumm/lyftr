import { useState, type ReactNode } from 'react'
import { Pressable } from 'react-native'
import { MoreVertical, type LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { ActionSheet } from './ActionSheet'
import { Icon } from './Icon'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  destructive?: boolean
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

export const MENU_TRIGGER_BOX = 'w-8 h-8 rounded-lg items-center justify-center'

// On a phone a menu is a bottom sheet, so native renders the trigger over an ActionSheet.
// The web dropdown is Menu.web.tsx.
export function Menu({ label, items, children, className = MENU_TRIGGER_BOX, disabled, title, subtitle }: MenuProps) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        disabled={disabled}
        hitSlop={6}
        className={`active:scale-95 ${disabled ? 'opacity-40' : ''} ${className}`}
      >
        {children ?? <Icon icon={MoreVertical} size="sm" color={colors.txMuted} />}
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
