import { Tabs } from 'expo-router'
import { House, Dumbbell, BookOpen, Apple, Scale, Settings } from 'lucide-react-native'
import { useTheme } from '../../src/theme/useTheme'

export default function TabsLayout() {
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
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: 'Workouts', tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="programs"
        options={{ title: 'Programs', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrition', tabBarIcon: ({ color, size }) => <Apple color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="weight"
        options={{ title: 'Weight', tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  )
}
