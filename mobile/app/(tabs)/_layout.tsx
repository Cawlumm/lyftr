import { Tabs } from 'expo-router'
import { House, ChartLine, Settings } from 'lucide-react-native'
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
        name="weight"
        options={{ title: 'Weight', tabBarIcon: ({ color, size }) => <ChartLine color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  )
}
