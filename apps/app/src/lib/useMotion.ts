import { useReducedMotion } from 'react-native-reanimated'
import { motionFor } from '../theme/motion'

// Native: the OS "Reduce Motion" setting, read once at app start (Reanimated's own contract).
export function useMotion() {
  return motionFor(useReducedMotion())
}
