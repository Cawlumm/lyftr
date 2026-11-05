import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Pressable, View } from 'react-native'
import { MoreVertical } from './icons'
import { useTheme } from '../../theme/useTheme'
import { AnchoredOverlay } from './AnchoredOverlay.web'
import { Icon } from './Icon'
import { interactive, touchTarget } from './interaction'
import type { MenuProps } from './Menu'
import { MENU_TRIGGER_BOX, swallowEscapeKeyup, typeaheadIndex } from './overlay'
import { AppText } from './Typography'

// The APG menu button (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) over a vertical
// menu (https://www.w3.org/WAI/ARIA/apg/patterns/menubar/): Enter, Space or ArrowDown opens on
// the first item and ArrowUp on the last; arrows wrap, Home/End jump, a letter jumps to the next
// item starting with it; Enter/Space/click runs an item; Escape closes onto the button, Tab
// closes and moves on from the button, and a press outside closes where it landed. Roving focus:
// every item is tabindex=-1 and focus itself moves.
export function Menu({ label, items, children, className, disabled, align = 'end' }: MenuProps) {
  const { colors, brand, isDark } = useTheme()
  const buttonId = useId()
  const menuId = useId()
  const [button, setButton] = useState<HTMLElement | null>(null)
  // The default trigger is a 32px box padded out to a 44px target; the menu lines up with the box.
  const [box, setBox] = useState<HTMLElement | null>(null)
  const hit = touchTarget(32, 32, { disabled })
  const menu = useRef<HTMLDivElement>(null)
  const itemEls = useRef<(HTMLDivElement | null)[]>([])
  // The item to focus when it opens; null while closed.
  const [open, setOpen] = useState<number | null>(null)
  const isOpen = open !== null

  const focusItem = (i: number) => itemEls.current[(i + items.length) % items.length]?.focus()
  const current = () => itemEls.current.findIndex(el => el === document.activeElement)
  const close = (refocus: boolean) => {
    setOpen(null)
    if (refocus) button?.focus()
  }
  // Focus goes back to the button before the item runs, so a dialog it opens returns there.
  const run = (i: number) => {
    close(true)
    items[i].onSelect()
  }

  useEffect(() => {
    if (open !== null) focusItem(open)
    // Only on opening: the items array is new on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button?.contains(target)) setOpen(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [isOpen, button])

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    setOpen(e.key === 'ArrowDown' ? 0 : items.length - 1)
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const i = current()
    const key = e.key
    // Not prevented: with focus back on the button, the browser's own Tab moves on from there.
    if (key === 'Tab') { close(true); return }
    if (key === 'ArrowDown') focusItem(i + 1)
    else if (key === 'ArrowUp') focusItem(i - 1)
    else if (key === 'Home') focusItem(0)
    else if (key === 'End') focusItem(items.length - 1)
    else if (key === 'Escape') { close(true); swallowEscapeKeyup() }
    else if ((key === 'Enter' || key === ' ') && i >= 0) run(i)
    else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const next = typeaheadIndex(items.map(it => it.label), i, key)
      if (next >= 0) focusItem(next)
    } else return
    e.preventDefault()
    // The menu's Escape is its own: a sheet the menu sits in stays open (keydown stops here,
    // and swallowEscapeKeyup stops the keyup the Modal listens for).
    e.stopPropagation()
  }

  // RN's types have none of these; react-native-web forwards them to the DOM.
  const triggerA11y = {
    'aria-haspopup': 'menu',
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? menuId : undefined,
    onKeyDown: onButtonKey,
  } as object

  return (
    <>
      {/* A Pressable, not a <button>: inside a pressable card, RN's responder system gives the
          press to the deepest Pressable, so the card does not also open. */}
      <Pressable
        ref={node => setButton(node as unknown as HTMLElement | null)}
        nativeID={buttonId}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => (isOpen ? close(true) : setOpen(0))}
        style={className === undefined ? hit.style : undefined}
        className={className === undefined
          ? `${disabled ? 'opacity-40' : ''} ${hit.outer}`
          : `${disabled ? 'opacity-40' : ''} ${interactive('hover:bg-surface-muted', { disabled })} ${className}`}
        {...triggerA11y}
      >
        {className === undefined ? (
          <View ref={node => setBox(node as unknown as HTMLElement | null)} className={`${MENU_TRIGGER_BOX} group-hover/hit:bg-surface-muted ${hit.inner}`}>
            {children ?? <Icon icon={MoreVertical} size="sm" color={colors.txMuted} />}
          </View>
        ) : (children ?? <Icon icon={MoreVertical} size="sm" color={colors.txMuted} />)}
      </Pressable>
      {button ? (
        <AnchoredOverlay
          ref={menu}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          anchor={box ?? button}
          open={isOpen}
          side="bottom"
          align={align}
          onKeyDown={onMenuKey}
          className="min-w-[200px] max-w-[320px] rounded-xl border border-surface-border bg-surface-raised p-1.5 shadow-lg"
        >
          {items.map((item, i) => (
            <Fragment key={i}>
              {item.separated && i > 0 ? <div role="separator" className="mx-1.5 my-1 h-px bg-surface-border" /> : null}
              <div
                ref={el => { itemEls.current[i] = el }}
                role="menuitem"
                tabIndex={-1}
                // A portal still bubbles through the React tree, into whatever card holds the menu.
                onClick={e => { e.stopPropagation(); run(i) }}
                // Pointer and keyboard share one highlight: hovering an item focuses it, as in the
                // APG example and in desktop menus.
                onPointerMove={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.focus() }}
                className={`flex flex-row items-center gap-2.5 rounded-lg px-3 py-2 outline-none focus:bg-surface-muted ${interactive('', { inset: true })}`}
              >
                {item.icon ? (
                  <Icon icon={item.icon} size="md" color={item.destructive ? (isDark ? brand.errorSoft : brand.error) : colors.txMuted} />
                ) : null}
                <AppText variant="body" color={item.destructive ? 'error' : 'primary'}>{item.label}</AppText>
              </div>
            </Fragment>
          ))}
        </AnchoredOverlay>
      ) : null}
    </>
  )
}
