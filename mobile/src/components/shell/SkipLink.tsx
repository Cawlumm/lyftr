import { useState } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'

// The visible screen's main landmark. Stack and tab screens stay mounted under the one in view
// (display:none), so the first main in the document is not necessarily the one on screen.
function visibleMain(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=main]')).find(el => el.getClientRects().length > 0)
}

// WCAG 2.4.1 Bypass Blocks: the first Tab stop, off-screen until it has focus, and it moves
// focus (not just the scroll position) to the content, so the next Tab continues from there.
// Web only: rendered by the sidebar.
export function SkipLink() {
  const { t } = useTranslation()
  const [focused, setFocused] = useState(false)
  const skip = (e: { preventDefault?: () => void }) => {
    e.preventDefault?.()
    const main = visibleMain()
    if (!main) return
    main.setAttribute('tabindex', '-1')
    main.focus()
  }
  // RN's Pressable types have no href; react-native-web renders an <a> with it.
  const anchor = { href: '#main' } as object
  return (
    <Pressable
      accessibilityRole="link"
      onPress={skip}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ position: 'absolute', left: 12, top: focused ? 12 : -200, zIndex: 50 }}
      className="rounded-lg bg-brand-700 px-4 py-2.5 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      {...anchor}
    >
      <AppText variant="bodySemibold" color="white">{t('nav.skipToContent')}</AppText>
    </Pressable>
  )
}
