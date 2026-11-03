import type { ReactNode } from 'react'
import { ScrollView, Text, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from '@lyftr/shared'
import { AuthStack } from './AuthStack'
import { BarbellMark } from './Logo'
import { Icon } from './ui/Icon'
import { Apple, Dumbbell, TrendingUp, type LucideIcon } from './ui/icons'
import { useBreakpoint } from '../lib/useBreakpoint'
import { useTheme } from '../theme/useTheme'

const FEATURES: { icon: LucideIcon; label: 'auth.hero.features.workouts' | 'auth.hero.features.food' | 'auth.hero.features.progress' }[] = [
  { icon: Dumbbell, label: 'auth.hero.features.workouts' },
  { icon: Apple, label: 'auth.hero.features.food' },
  { icon: TrendingUp, label: 'auth.hero.features.progress' },
]

// The two soft brand glows of the Vite sign-in panel. react-native-web passes backgroundImage
// through to CSS; RN's types have no such key.
const GLOWS = {
  backgroundImage:
    'radial-gradient(ellipse at 20% 30%, rgba(0,184,217,0.25) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(139,92,246,0.15) 0%, transparent 50%)',
} as unknown as ViewStyle

// From lg the sign-in screens are a split like the Vite pages: a brand panel on the left and the
// form centred on the right. The panel is dark in both themes, so white text on it measures well
// above AA, which the phone's cyan hero does not. Below lg it is the phone layout, minus nothing.
export function AuthScaffold(props: { heading: string; subtitle: string; children: ReactNode }) {
  const { lg } = useBreakpoint()
  return lg ? <AuthSplit {...props} /> : <AuthStack {...props} />
}

function AuthSplit({ heading, subtitle, children }: { heading: string; subtitle: string; children: ReactNode }) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.base }}>
      <View role="complementary" aria-label={t('auth.tagline')} style={{ flex: 1, overflow: 'hidden' }}>
        <LinearGradient
          colors={['#030812', '#0a1b2e', '#081326']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, padding: 48 }}
        >
          <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, GLOWS]} />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: -80, bottom: -40, opacity: 0.06, transform: [{ rotate: '-8deg' }] }}
          >
            <BarbellMark size={420} bar="#ffffff" plate="#ffffff" plateEdge="#ffffff" highlight={false} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
              }}
            >
              <BarbellMark size={30} bar="#ffffff" />
            </View>
            <View>
              <Text style={{ fontFamily: 'Outfit_800ExtraBold', fontSize: 26, letterSpacing: -0.5, color: '#fff' }}>lyftr</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
                {t('auth.tagline')}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', gap: 28, maxWidth: 440, paddingVertical: 48 }}>
            <View>
              <Text style={{ fontFamily: 'Outfit_800ExtraBold', fontSize: 48, lineHeight: 52, letterSpacing: -1, color: '#fff' }}>
                {t('auth.hero.headline')}
              </Text>
              <Text style={{ fontFamily: 'Outfit_800ExtraBold', fontSize: 48, lineHeight: 52, letterSpacing: -1, color: '#22d3ee' }}>
                {t('auth.hero.headlineAccent')}
              </Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, lineHeight: 25, color: 'rgba(255,255,255,0.78)' }}>
              {t('auth.hero.description')}
            </Text>
            <View role="list" style={{ gap: 14 }}>
              {FEATURES.map(({ icon, label }) => (
                <View key={label} role="listitem" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,184,217,0.14)' }}>
                    <Icon icon={icon} size="md" color="#22d3ee" />
                  </View>
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: 'rgba(255,255,255,0.86)' }}>{t(label)}</Text>
                </View>
              ))}
            </View>
          </View>

        </LinearGradient>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48, paddingVertical: 56 }}
        keyboardShouldPersistTaps="handled"
      >
        <View role="main" style={{ width: '100%', maxWidth: 400 }}>
          <Text
            role="heading"
            aria-level={1}
            style={{ fontFamily: 'Outfit_800ExtraBold', fontSize: 34, lineHeight: 38, letterSpacing: -0.7, color: colors.txPrimary }}
          >
            {heading}
          </Text>
          <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: colors.txSecondary, marginTop: 8, marginBottom: 8 }}>
            {subtitle}
          </Text>
          {children}
        </View>
      </ScrollView>
    </View>
  )
}
