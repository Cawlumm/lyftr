import { Easing } from 'react-native-reanimated'

// One set of motion tokens. UI transitions stay 120-250ms and animate transform/opacity only;
// the ambient loops below are the only things allowed to run longer, and they stop entirely
// under reduced motion (see useMotion).
export const DURATION = { fast: 120, base: 180, slow: 250 } as const

export const AMBIENT = {
  shimmer: 1200,
  loadingCycle: 1600,
  loadingBlink: 260,
  loadingDotStagger: 160,
  pulse: 240,
} as const

// Same curves the app already used (Easing.out/in/inOut), named once.
export const EASING = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.quad),
  standard: Easing.inOut(Easing.ease),
  linear: Easing.linear,
} as const

// Zero durations under reduced motion; shared by the native and web hooks.
export function motionFor(reduced: boolean) {
  return {
    reduced,
    duration: (ms: number) => (reduced ? 0 : ms),
    fast: reduced ? 0 : DURATION.fast,
    base: reduced ? 0 : DURATION.base,
    slow: reduced ? 0 : DURATION.slow,
  }
}
