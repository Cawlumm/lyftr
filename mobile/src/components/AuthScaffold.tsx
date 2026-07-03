import { ReactNode, useRef, useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarbellMark } from './Logo'
import { useTheme } from '../theme/useTheme'

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
  const { colors } = useTheme()

  // Stretchy pull-down header (classic iOS): track the scroll offset and, on
  // overscroll (negative scrollY, iOS bounce), stretch the hero's gradient BACKGROUND
  // while the hero text rides down with the content. The background is (1) pinned to
  // the viewport top by translating it against the scroll and (2) scaled from its top
  // edge (transformOrigin 'top', RN 0.81+) by 1 + pull/heroH, so its bottom edge
  // tracks the sheet exactly — no base-color gap ever peeks above the gradient or
  // between gradient and sheet, and the notch/safe area stays covered. Both
  // interpolations clamp at 0 so normal (positive) scrolling is untouched.
  const scrollY = useRef(new Animated.Value(0)).current
  const [heroH, setHeroH] = useState(320) // measured; fallback ≈ real hero height
  const bgTranslate = scrollY.interpolate({
    inputRange: [-1, 0],
    outputRange: [-1, 0], // identity for pulls (extrapolates left), 0 once scrolled
    extrapolateRight: 'clamp',
  })
  const bgScale = scrollY.interpolate({
    inputRange: [-heroH, 0],
    outputRange: [2, 1],
    extrapolateRight: 'clamp',
  })
  // Hero text grows with the pull but ONLY taller, never wider — scaleY from the top
  // edge so the words enlarge downward toward the sheet without ever clipping on the
  // left/right. Clamped both ends so positive scrolling is untouched and deep pulls
  // don't distort it past a tasteful cap.
  const textScaleY = scrollY.interpolate({
    inputRange: [-heroH, 0],
    outputRange: [1.25, 1],
    extrapolate: 'clamp',
  })

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Hero is always the brand gradient (dark), so the status bar stays light. */}
      <StatusBar style="light" />
      <Animated.ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: Platform.OS !== 'web', // RN-web has no native driver
        })}
        scrollEventThrottle={16}
      >
        {/* HERO — gradient bg is absolute so it can stretch independently of the text */}
        <View
          onLayout={(e) => setHeroH(Math.max(1, Math.round(e.nativeEvent.layout.height)))}
          style={{ paddingBottom: 46 }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              transformOrigin: 'top',
              transform: [{ translateY: bgTranslate }, { scale: bgScale }],
            }}
          >
            <LinearGradient
              colors={['#00b8d9', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            >
              {/* Watermark lives in the stretchy layer → subtle parallax drift on pull. */}
              <View
                pointerEvents="none"
                style={{ position: 'absolute', right: -60, top: 118, opacity: 0.15, transform: [{ rotate: '-8deg' }] }}
              >
                <BarbellMark size={260} bar="#ffffff" plate="#ffffff" plateEdge="#ffffff" highlight={false} />
              </View>
            </LinearGradient>
          </Animated.View>

          <SafeAreaView edges={['top']}>
            <Animated.View
              style={{
                paddingHorizontal: 28,
                paddingTop: 14,
                transformOrigin: 'top',
                transform: [{ scaleY: textScaleY }],
              }}
            >
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
            </Animated.View>
          </SafeAreaView>
        </View>

        {/* SHEET */}
        <View
          style={{
            flex: 1,
            marginTop: -26,
            backgroundColor: colors.base,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            borderTopWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 28,
            paddingTop: 12,
          }}
        >
          <View
            style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 }}
          />
          {children}
        </View>
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  )
}
