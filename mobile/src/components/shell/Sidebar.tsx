import { useLayoutEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useTranslation } from '@lyftr/shared'
import { BarbellMark } from '../Logo'
import { AppText, Icon, interactive, isPlainClick, type Click } from '../ui'
import { Apple, BookOpen, Dumbbell, House, Scale, type LucideIcon } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'
import { SkipLink } from './SkipLink'
import { UserMenu } from './UserMenu'

export const SIDEBAR_WIDTH = 240

// Tab route name -> its URL and label. Settings is a tab route too, reached from the user menu.
const NAV: Record<string, { href: string; label: 'nav.home' | 'nav.workouts' | 'nav.programs' | 'nav.nutrition' | 'nav.weight'; icon: LucideIcon }> = {
  index: { href: '/', label: 'nav.home', icon: House },
  workouts: { href: '/workouts', label: 'nav.workouts', icon: Dumbbell },
  programs: { href: '/programs', label: 'nav.programs', icon: BookOpen },
  nutrition: { href: '/nutrition', label: 'nav.nutrition', icon: Apple },
  weight: { href: '/weight', label: 'nav.weight', icon: Scale },
}

// RN's types have neither prop; react-native-web renders an <a href> with aria-current.
const linkProps = (href: string, current: boolean) => ({ href, 'aria-current': current ? 'page' : undefined }) as object

// What the default bar does on a press: the event lets a screen intercept it (and makes a
// focused tab's stack pop to its root), and only an unprevented press on another tab switches.
function pressTab({ emitter, navigateToTab }: Pick<BottomTabBarProps, 'emitter' | 'navigateToTab'>, key: string, focused: boolean) {
  const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true })
  if (!focused && !event.defaultPrevented) navigateToTab(key)
}

// The web tab bar at lg and up (Tabs tabBarPosition 'left'). Items are real links, so
// middle-click and "open in new tab" work, but a plain click goes through the navigator the way
// the default bar does: emit tabPress (a focused stack pops to its root on it), then switch tab.
// Following the href instead would rebuild the tab's stack from the URL and drop its history.
export function Sidebar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()

  // ContentColumn's scrollBleed centres on the content area, which this narrows by its width.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--shell-inset', `${SIDEBAR_WIDTH}px`)
    return () => { root.removeProperty('--shell-inset') }
  }, [])

  return (
    <View nativeID="app-sidebar" style={{ width: SIDEBAR_WIDTH }} className="h-full border-r border-surface-border bg-surface-raised px-3 pb-3 pt-5">
      <SkipLink />
      <View className="flex-row items-center gap-2.5 px-3 pb-6">
        <BarbellMark size={30} bar={colors.txPrimary} />
        <Text className="font-display-heavy text-[22px] text-tx-primary" style={{ letterSpacing: -0.4 }}>lyftr</Text>
      </View>
      <View role="navigation" aria-label={t('nav.primary')} className="flex-1 gap-1">
        {state.routes.map((route, index) => {
          const item = NAV[route.name]
          if (!item) return null
          const focused = index === state.index
          const onPress = (e: Click) => {
            if (!isPlainClick(e)) return
            e.preventDefault?.()
            pressTab({ emitter, navigateToTab }, route.key, focused)
          }
          return (
            <Pressable
              key={route.key}
              accessibilityRole="link"
              onPress={onPress}
              className={`h-10 flex-row items-center gap-3 rounded-lg px-3 ${focused ? 'bg-brand-500/10' : ''} ${interactive(focused ? '' : 'hover:bg-surface-muted')}`}
              {...linkProps(item.href, focused)}
            >
              <Icon icon={item.icon} size="lg" color={focused ? accent : colors.txSecondary} strokeWidth={focused ? 2.5 : 2} />
              <AppText variant={focused ? 'bodySemibold' : 'body'} color={focused ? 'primary' : 'secondary'}>
                {t(item.label)}
              </AppText>
            </Pressable>
          )
        })}
      </View>
      <View className="border-t border-surface-border pt-3">
        <UserMenu />
      </View>
    </View>
  )
}
