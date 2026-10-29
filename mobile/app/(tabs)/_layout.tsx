import { Tabs } from 'expo-router'
import { House, Dumbbell, BookOpen, Apple, Scale } from 'lucide-react-native'
import { useTranslation } from '@lyftr/shared'
import { useTheme } from '../../src/theme/useTheme'

export default function TabsLayout() {
  const { t } = useTranslation()
  const { colors, brand } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
          avatar went nowhere. Rendering no button keeps /settings routable without a tab. */}
      <Tabs.Screen name="settings" options={{ tabBarButton: () => null }} />
    </Tabs>
  )
}
