import type { ReactNode } from 'react'
import Animated, { FadeOut } from 'react-native-reanimated'

// The native gym overlay fills the active screen above its tab bar, so the tabs stay a way out of
// a running session. GymFrame.web.tsx is the browser's modal dialog.
export function GymFrame({ children }: { onClose: () => void; children: ReactNode }) {
  return (
    // Soft dissolve on exit (finish / discard / minimize) instead of a hard cut — the overlay
    // fades as the navigation settles underneath. Exit-only; entering is the route push.
    <Animated.View exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
      {children}
    </Animated.View>
  )
}
