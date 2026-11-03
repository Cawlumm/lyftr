import { useWindowDimensions } from 'react-native'
import breakpoints from '../theme/breakpoints.json'

export type Breakpoint = 'base' | keyof typeof breakpoints

const ORDER = ['xl', 'lg', 'md', 'sm'] as const

// Same thresholds as the sm:/md:/lg:/xl: classes: tailwind.config.js reads the one JSON.
export function breakpointFor(width: number): Breakpoint {
  return ORDER.find(name => width >= breakpoints[name]) ?? 'base'
}

// `sm`..`xl` are min-width flags (true at that width and above), like the classes.
export function useBreakpoint() {
  const { width } = useWindowDimensions()
  return {
    width,
    current: breakpointFor(width),
    sm: width >= breakpoints.sm,
    md: width >= breakpoints.md,
    lg: width >= breakpoints.lg,
    xl: width >= breakpoints.xl,
  }
}
