import { useEffect, useRef, type ReactNode } from 'react'
import { Animated as RNAnimated, Modal, PanResponder, Platform, Pressable, View } from 'react-native'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { DURATION, EASING } from '../../theme/motion'
import { useMotion } from '../../lib/useMotion'

// Duration of the slide-up; exported so callers can time a follow-up sheet (e.g. an
// ActionSheet handing off to a ConfirmSheet) to start after this one dismisses.
export const SHEET_ANIM_MS = DURATION.slow

// How far, or how fast, a downward swipe on the grabber has to go to dismiss the sheet.
const DISMISS_DISTANCE = 90
const DISMISS_VELOCITY = 0.8

// react-native-web has no native animation module; asking for one logs a warning on every drag.
const nativeDriver = () => Platform.OS !== 'web'

type SheetHaptic = 'selection' | 'warning' | 'none'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Extra bottom padding beyond the safe-area inset (px). */
  bottomInset?: number
  /** Haptic fired as the sheet opens. */
  haptic?: SheetHaptic
}

// The generic bottom-sheet shell every sheet in the app is built from (ConfirmSheet,
// ActionSheet, …). Owns the device-correct behavior once, so nothing re-derives it:
//  • Insets — a SafeAreaProvider nested inside a Modal measures 0 on a real phone, so
//    we read the root provider's insets (this sits in the app tree; the Modal is just
//    a portal) and pad the sheet's bottom manually.
//  • Motion — animationType="slide" would slide the whole overlay, scrim included, up
//    from the bottom. Instead the scrim fades in place (animationType="fade") and only
//    the sheet slides, on an ease-out curve (no spring bounce).
// Children own their horizontal padding; the shell provides the surface, grabber, and
// safe bottom. Tap the scrim to dismiss; the sheet body stops propagation.
export function Sheet({ open, onClose, children, bottomInset = 20, haptic = 'none' }: Props) {
  const insets = useSafeAreaInsets()
  const { duration } = useMotion()

  // Swipe down on the grabber to dismiss. PanResponder rather than gesture-handler: a Modal is
  // its own native root, and gesture-handler needs a root view inside it to receive touches.
  // Only the grabber zone listens, so a ScrollView inside the sheet keeps its own scrolling.
  const dragY = useRef(new RNAnimated.Value(0)).current
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const durationRef = useRef(duration)
  durationRef.current = duration
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          RNAnimated.timing(dragY, { toValue: 600, duration: durationRef.current(DURATION.fast), useNativeDriver: nativeDriver() }).start(() => {
            onCloseRef.current()
            // A sheet whose parent declines to close (a confirm that is mid-request) must come
            // back rather than sit invisible behind its scrim. A no-op when it did close.
            RNAnimated.spring(dragY, { toValue: 0, useNativeDriver: nativeDriver(), bounciness: 0 }).start()
          })
        } else {
          RNAnimated.spring(dragY, { toValue: 0, useNativeDriver: nativeDriver(), bounciness: 0 }).start()
        }
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(dragY, { toValue: 0, useNativeDriver: nativeDriver(), bounciness: 0 }).start()
      },
    }),
  ).current

  useEffect(() => {
    if (open) dragY.setValue(0)
  }, [open, dragY])

  useEffect(() => {
    if (!open || haptic === 'none') return
    const fire = haptic === 'warning'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync()
    fire.catch(() => {})
  }, [open, haptic])

  if (!open) return null

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(duration(SHEET_ANIM_MS)).easing(EASING.enter)}>
          <RNAnimated.View style={{ transform: [{ translateY: dragY }] }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ paddingBottom: insets.bottom + bottomInset }}
              className="rounded-t-3xl border border-surface-border bg-surface-base pt-3"
            >
              {/* Grabber — signals a dismissible sheet, and is the handle you swipe down. The
                  zone is taller than the bar so it is easy to hit; matches the web handle. */}
              <View testID="sheet-grabber" {...pan.panHandlers} className="-mt-3 items-center pb-3 pt-3">
                <View className="h-1 w-10 rounded-full bg-surface-muted" />
              </View>
              {children}
            </Pressable>
          </RNAnimated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}
