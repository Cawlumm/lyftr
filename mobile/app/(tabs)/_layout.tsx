import { Platform, View } from 'react-native'
import { Tabs } from 'expo-router'
import { BottomTabBar } from 'expo-router/js-tabs'
import { House, Dumbbell, BookOpen, Apple, Scale } from '../../src/components/ui/icons'
import { useTranslation } from '@lyftr/shared'
import { useTheme } from '../../src/theme/useTheme'
import { useBreakpoint } from '../../src/lib/useBreakpoint'
import { Sidebar } from '../../src/components/shell/Sidebar'

export default function TabsLayout() {
  const { t } = useTranslation()
  const { colors, brand } = useTheme()
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
        tabBarActiveTintColor: brand.cyan,
        tabBarInactiveTintColor: colors.txMuted,
        tabBarStyle: {
          backgroundColor: colors.raised,
          borderTopColor: colors.border,
        },
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
