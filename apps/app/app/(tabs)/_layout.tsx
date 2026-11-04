import { Platform, View } from 'react-native'
import { Tabs } from 'expo-router'
import { BottomTabBar } from 'expo-router/js-tabs'
import { House, Dumbbell, BookOpen, Apple, Scale } from '../../src/components/ui/icons'
import { palette, useTranslation } from '@lyftr/shared'
import { useTheme } from '../../src/theme/useTheme'
import { useBreakpoint } from '../../src/lib/useBreakpoint'
import { Sidebar } from '../../src/components/shell/Sidebar'

// The sidebar's labels are AppText; the bottom bar's are React Navigation's own Text.
const WEB_TAB_LABEL = { fontFamily: 'PlusJakartaSans_600SemiBold' }

export default function TabsLayout() {
  const { t } = useTranslation()
  const { colors, brand, isDark } = useTheme()
  const { lg } = useBreakpoint()
  // Web at lg and up gets a sidebar; phones, tablets below lg and native keep the bottom tabs.
  const sidebar = Platform.OS === 'web' && lg
  return (
    <Tabs
      // A tab switch is a browser history entry on the web, as a link click is on any site, so
      // Back and Forward walk between tabs. The default only pushes the first switch away from
      // Home and replaces after that. Native keeps the default (Android's back button).
      backBehavior={Platform.OS === 'web' ? 'fullHistory' : undefined}
      // The default bar renders a tablist; the web needs a navigation landmark around it.
      tabBar={Platform.OS !== 'web' ? undefined : sidebar
        ? (props) => <Sidebar {...props} />
        : (props) => <View role="navigation" aria-label={t('nav.primary')}><BottomTabBar {...props} /></View>}
      screenOptions={{
        headerShown: false,
        ...(sidebar ? { tabBarPosition: 'left' as const } : null),
        // brand-500 measures 2.4:1 on the light bar; web holds its 10px labels to AA.
        tabBarActiveTintColor: Platform.OS === 'web' && !isDark ? palette.brand[700] : brand.cyan,
        tabBarInactiveTintColor: colors.txMuted,
        tabBarStyle: {
          backgroundColor: colors.raised,
          borderTopColor: colors.border,
          // The default 49 leaves the web label a 10px box for a 13px line, which clips it.
          ...(Platform.OS === 'web' ? { height: 56 } : null),
        },
        // Else the web label falls back to the browser's system-ui.
        ...(Platform.OS === 'web' ? { tabBarLabelStyle: WEB_TAB_LABEL } : null),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('nav.home'), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: t('nav.workouts'), tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="programs"
        options={{ title: t('nav.programs'), tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: t('nav.nutrition'), tabBarIcon: ({ color, size }) => <Apple color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="weight"
        options={{ title: t('nav.weight'), tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      {/* Settings lives off the footer now — reached via the avatar in the Home header.
          Not href:null: since SDK 58 that hides the tab and makes its route unreachable, so the
          avatar went nowhere. display:none on the item keeps /settings routable and takes its
          slot out of the bar too; hiding only the button left an empty fifth of the bar. */}
      <Tabs.Screen name="settings" options={{ tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
  )
}
