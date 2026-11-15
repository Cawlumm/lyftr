// How the body figures are drawn, in one place: the exercise page's diagram and the muscle picker
// must agree on which colour means "main" and which "also works".
export const BODY_SECONDARY_COLOR = '#0e7490'
export const BODY_MAIN_COLOR = '#22d3ee'
// [intensity 1 = secondary, intensity 2 = main], the order react-native-body-highlighter reads.
export const BODY_COLORS = [BODY_SECONDARY_COLOR, BODY_MAIN_COLOR] as const
export const bodyFill = (isDark: boolean) => (isDark ? '#162240' : '#e2e8f0')
