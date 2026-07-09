import { memo } from 'react'
import { View } from 'react-native'
import Body, { type Slug } from 'react-native-body-highlighter'
import type { Exercise } from '@lyftr/shared'
import { muscleToBodySlugs } from '../../utils/exerciseUtils'
import { useTheme } from '../../theme/useTheme'
import { AppText } from '../ui'

// Mobile equivalent of web's react-body-highlighter `Model` (gym exercise-info "Muscles
// Worked"). Renders front + back highlighted body maps via react-native-body-highlighter
// (react-native-svg). Primary muscles get the brighter colour (intensity 2), secondary
// the darker (intensity 1) — same split + colours as web. Returns null when nothing maps.
// Memoized: the SVG body maps are expensive to re-render, and the parent gym overlay can
// re-render for unrelated reasons (rest sheet toggling) — this keeps the diagram stable
// unless the exercise (or theme) actually changes.
const COLORS = ['#0e7490', '#22d3ee'] // [intensity1 = secondary, intensity2 = primary]

export const MuscleDiagram = memo(function MuscleDiagram({ exercise }: { exercise: Exercise }) {
  const { isDark } = useTheme()
  const primary = muscleToBodySlugs(exercise.muscle_group)
  const secondary = (exercise.secondary_muscles || [])
    .flatMap((m) => muscleToBodySlugs(m))
    .filter((s) => !primary.includes(s))

  const data = [
    ...primary.map((slug) => ({ slug: slug as Slug, intensity: 2 })),
    ...secondary.map((slug) => ({ slug: slug as Slug, intensity: 1 })),
  ]
  if (data.length === 0) return null

  const bodyColor = isDark ? '#162240' : '#e2e8f0'

  return (
    <View>
      <View className="flex-row items-start justify-center gap-6">
        <View className="items-center gap-1">
          <Body data={data} side="front" scale={0.85} colors={COLORS} defaultFill={bodyColor} border="none" />
          <AppText variant="caption" color="muted">Front</AppText>
        </View>
        <View className="items-center gap-1">
          <Body data={data} side="back" scale={0.85} colors={COLORS} defaultFill={bodyColor} border="none" />
          <AppText variant="caption" color="muted">Back</AppText>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
          <AppText variant="caption" color="muted">Primary</AppText>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: '#0e7490' }} />
          <AppText variant="caption" color="muted">Secondary</AppText>
        </View>
      </View>
    </View>
  )
})
