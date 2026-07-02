import { ReactNode } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarbellMark } from './Logo'

// Bold-branded auth layout in our dark palette: a cyan→violet gradient hero (brand
// gradient) with the barbell mark + wordmark + tagline, and a dark sheet that
// overlaps it with a rounded top. Form content is passed as children.
export function AuthScaffold({
  heading,
  subtitle,
  children,
}: {
  heading: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#070d1a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* HERO */}
        <LinearGradient
          colors={['#00b8d9', '#8b5cf6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 46 }}
        >
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: -60, top: 118, opacity: 0.15, transform: [{ rotate: '-8deg' }] }}
          >
            <BarbellMark size={260} bar="#ffffff" plate="#ffffff" plateEdge="#ffffff" highlight={false} />
          </View>

          <SafeAreaView edges={['top']}>
            <View style={{ paddingHorizontal: 28, paddingTop: 14 }}>
              {/* Brand */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.30)',
                  }}
                >
                  <BarbellMark size={34} bar="#ffffff" />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Outfit_800ExtraBold', fontSize: 30, letterSpacing: -0.6, color: '#fff' }}>
                    lyftr
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'PlusJakartaSans_800ExtraBold',
                      fontSize: 10.5,
                      letterSpacing: 3.2,
                      color: 'rgba(255,255,255,0.82)',
                      marginTop: 6,
                    }}
                  >
                    TRAIN · TRACK · PROGRESS
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  fontFamily: 'Outfit_800ExtraBold',
                  fontSize: 37,
                  letterSpacing: -0.8,
                  color: '#fff',
                  marginTop: 34,
                  lineHeight: 39,
                }}
              >
                {heading}
              </Text>
              <Text
                style={{
                  fontFamily: 'PlusJakartaSans_600SemiBold',
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.85)',
                  marginTop: 8,
                }}
              >
                {subtitle}
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* SHEET */}
        <View
          style={{
            flex: 1,
            marginTop: -26,
            backgroundColor: '#070d1a',
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            borderTopWidth: 1,
            borderColor: '#1c2f50',
            paddingHorizontal: 28,
            paddingTop: 12,
          }}
        >
          <View
            style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#1c2f50', alignSelf: 'center', marginBottom: 6 }}
          />
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
