import { View } from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { nameInitial, useTranslation } from '@lyftr/shared'
import { AppText, Icon, Menu } from '../ui'
import { ChevronsUpDown, LogOut, Moon, Sun, User } from '../ui/icons'
import { useAuthStore, useDisplayName } from '../../lib/lyftr'
import { useTheme } from '../../theme/useTheme'

// The sidebar's footer: who is signed in, and the account actions the Vite shell's avatar menu
// held (Settings, theme, sign out). The trigger shows the name and email, so its accessible name
// starts with the visible name (WCAG 2.5.3 Label in Name).
export function UserMenu() {
  const { t } = useTranslation()
  const { colors, isDark, toggle } = useTheme()
  const email = useAuthStore((s) => s.user?.email)
  const logout = useAuthStore((s) => s.logout)
  const name = useDisplayName()

  const items = [
    { label: t('nav.settings'), icon: User, onSelect: () => router.navigate('/settings') },
    { label: t(isDark ? 'nav.lightMode' : 'nav.darkMode'), icon: isDark ? Sun : Moon, onSelect: () => { void toggle() } },
    { label: t('nav.signOut'), icon: LogOut, destructive: true, onSelect: () => { void logout() } },
  ]

  return (
    <Menu
      label={t('nav.userMenuNamed', { name })}
      items={items}
      align="start"
      className="w-full flex-row items-center gap-3 rounded-xl p-2"
    >
      <LinearGradient
        colors={['#0891b2', '#00b8d9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText variant="subheading" color="white">{nameInitial(name)}</AppText>
      </LinearGradient>
      <View className="min-w-0 flex-1">
        <AppText variant="bodySemibold" numberOfLines={1}>{name}</AppText>
        {email ? <AppText variant="caption" color="secondary" numberOfLines={1}>{email}</AppText> : null}
      </View>
      <Icon icon={ChevronsUpDown} size="md" color={colors.txMuted} />
    </Menu>
  )
}
