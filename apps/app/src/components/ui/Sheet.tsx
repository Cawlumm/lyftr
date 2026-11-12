import { useEffect, useRef, type ReactNode } from 'react'
import { Animated as RNAnimated, Dimensions, Easing as RNEasing, Modal, PanResponder, Platform, View } from 'react-native'
import Animated, { Keyframe } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { DURATION, EASING } from '../../theme/motion'
import { useMotion } from '../../lib/useMotion'
import { SheetBackdrop, SheetSurface, dialogA11y, useSheetDialog } from './SheetFrame'

// Duration of the slide-up; exported so callers can time a follow-up sheet (e.g. an
// ActionSheet handing off to a ConfirmSheet) to start after this one dismisses.
export const SHEET_ANIM_MS = DURATION.slow

// How far, or how fast, a downward swipe on the grabber has to go to dismiss the sheet.
const DISMISS_DISTANCE = 90
const DISMISS_VELOCITY = 0.8

// react-native-web has no native animation module; asking for one logs a warning on every drag.
const nativeDriver = () => Platform.OS !== 'web'

type SheetHaptic = 'selection' | 'warning' | 'none'

// The dialog's width on a wide web screen; a phone always gets the full-width sheet.
const DIALOG_WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' } as const

const dialogEnter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASING.enter },
})

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Extra bottom padding beyond the safe-area inset (px). */
  bottomInset?: number
  /** Haptic fired as the sheet opens. */
  haptic?: SheetHaptic
  /** nativeID of the visible title, which names the dialog on web. */
  labelledBy?: string
  /** nativeID of a short message that describes it (web). */
  describedBy?: string
  /** Max width when shown as a dialog on a wide web screen. */
  width?: keyof typeof DIALOG_WIDTH
}

// The generic bottom-sheet shell every sheet in the app is built from (ConfirmSheet,
// ActionSheet, …). Owns the device-correct behavior once, so nothing re-derives it:
//  • Insets — a SafeAreaProvider nested inside a Modal measures 0 on a real phone, so
//    we read the root provider's insets (this sits in the app tree; the Modal is just
//    a portal) and pad the sheet's bottom manually.
//  • Motion — animationType="slide" would slide the whole overlay, scrim included, up
//    from the bottom. Instead the scrim fades in place (animationType="fade") and only
//    the sheet slides, on an ease-out curve (no spring bounce).
//  • The slide is a plain Animated transform, not a Reanimated `entering` animation (#145).
//    On Android a Modal is first laid out short by the system bars, then at full height
//    (react-native#59353), and a view with `entering` keeps painting at its first position when
//    it moves before first paint (reanimated#10806, unreleased fix). The sheet was then drawn
//    about 50dp above where it took touches: taps on its buttons missed unless they hit the
//    lower edge. A transform over the sheet's real layout moves with it.
// Children own their horizontal padding; the shell provides the surface, grabber, and
// safe bottom. Tap the scrim to dismiss; the sheet body stops propagation.
// On a web screen from sm up the same content is a centred dialog instead (SheetFrame.web).
export function Sheet({
  open, onClose, children, bottomInset = 20, haptic = 'none', labelledBy, describedBy, width = 'md',
}: Props) {
  const insets = useSafeAreaInsets()
  const { duration, reduced } = useMotion()
  const dialog = useSheetDialog()

  // Swipe down on the grabber to dismiss. PanResponder rather than gesture-handler: a Modal is
  // its own native root, and gesture-handler needs a root view inside it to receive touches.
  // Only the grabber zone listens, so a ScrollView inside the sheet keeps its own scrolling.
  const dragY = useRef(new RNAnimated.Value(0)).current
  // Starts below the screen, so the first frame of an opening sheet is already off-screen.
  const slideY = useRef(new RNAnimated.Value(Dimensions.get('window').height)).current
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
    if (!open) {
      slideY.setValue(Dimensions.get('window').height)
      return
    }
    RNAnimated.timing(slideY, {
      toValue: 0,
      duration: durationRef.current(SHEET_ANIM_MS),
      easing: RNEasing.out(RNEasing.cubic), // EASING.enter's curve; that token is Reanimated's
      useNativeDriver: nativeDriver(),
    }).start()
  }, [open, slideY])

  useEffect(() => {
    if (!open || haptic === 'none') return
    const fire = haptic === 'warning'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync()
    fire.catch(() => {})
  }, [open, haptic])

  if (!open) return null

  // RN Modal on web holds back its focus trap and Escape until its fade ends, so under reduced
  // motion the fade goes too. Native keeps its fade either way.
  const animationType = Platform.OS === 'web' && reduced ? 'none' : 'fade'

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType={animationType}
      onRequestClose={onClose}
      {...dialogA11y(labelledBy, describedBy)}
    >
      <SheetBackdrop onClose={onClose} dialog={dialog}>
        {dialog ? (
          // The width sits on a plain View: on the Animated.View carrying `entering` the class
          // did not apply (measured).
          // The surface is capped to the viewport and scrolls: a short window (a phone in landscape)
          // would otherwise clip a sheet that has no ScrollView of its own, past both edges.
          <View className={`w-full ${DIALOG_WIDTH[width]}`}>
            <Animated.View entering={reduced ? undefined : dialogEnter.duration(DURATION.base)}>
              <SheetSurface
                style={{ paddingBottom: bottomInset }}
                className="max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl border border-surface-border bg-surface-base pt-6"
              >
                {children}
              </SheetSurface>
            </Animated.View>
          </View>
        ) : (
          <RNAnimated.View style={{ transform: [{ translateY: RNAnimated.add(slideY, dragY) }] }}>
            <SheetSurface
              style={{ paddingBottom: insets.bottom + bottomInset }}
              className="rounded-t-3xl border border-surface-border bg-surface-base pt-3"
            >
              {/* Grabber — signals a dismissible sheet, and is the handle you swipe down. The
                  zone is taller than the bar so it is easy to hit; matches the web handle. */}
              <View testID="sheet-grabber" {...pan.panHandlers} className="-mt-3 items-center pb-3 pt-3">
                <View className="h-1 w-10 rounded-full bg-surface-muted" />
              </View>
              {children}
            </SheetSurface>
          </RNAnimated.View>
        )}
      </SheetBackdrop>
    </Modal>
  )
}
