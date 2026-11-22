import { memo, useState } from 'react'
import { View } from 'react-native'
import Body, { type Slug } from 'react-native-body-highlighter'
import { useTranslation, type Exercise } from '@lyftr/shared'
import { muscleToBodySlugs } from '../../utils/exerciseUtils'
import { useTheme } from '../../theme/useTheme'
import { AppText } from '../ui'
import { BODY_COLORS, BODY_MAIN_COLOR, BODY_SECONDARY_COLOR, bodyFill } from './bodyFigure'

// Mobile equivalent of web's react-body-highlighter `Model` (gym exercise-info "Muscles
// Worked"). Renders front + back highlighted body maps via react-native-body-highlighter
// (react-native-svg). Primary muscles get the brighter colour (intensity 2), secondary
// the darker (intensity 1) — same split + colours as web. Returns null when nothing maps.
// Memoized: the SVG body maps are expensive to re-render, and the parent gym overlay can
// re-render for unrelated reasons (rest sheet toggling) — this keeps the diagram stable
// unless the exercise (or theme) actually changes.

// react-native-body-highlighter draws each figure 200 * scale wide. The scale follows the card's
// inner width so two figures and the gap between them never run past it, capped so a wide
// screen does not blow them up.
const FIGURE_WIDTH = 200
const FIGURE_GAP = 16
const MAX_SCALE = 0.85

export const MuscleDiagram = memo(function MuscleDiagram({ exercise }: { exercise: Exercise }) {
  const { isDark } = useTheme()
  const { t } = useTranslation()
  const [width, setWidth] = useState(0)
  const primary = muscleToBodySlugs(exercise.muscle_group)
  const secondary = (exercise.secondary_muscles || [])
    .flatMap((m) => muscleToBodySlugs(m))
    .filter((s) => !primary.includes(s))

  const data = [
    ...primary.map((slug) => ({ slug: slug as Slug, intensity: 2 })),
    ...secondary.map((slug) => ({ slug: slug as Slug, intensity: 1 })),
  ]
  if (data.length === 0) return null

  const scale = width > 0 ? Math.min(MAX_SCALE, (width - FIGURE_GAP) / 2 / FIGURE_WIDTH) : MAX_SCALE
  const bodyColor = bodyFill(isDark)

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="flex-row items-start justify-center" style={{ gap: FIGURE_GAP }}>
        <View className="items-center gap-1">
          <Body data={data} side="front" scale={scale} colors={BODY_COLORS} defaultFill={bodyColor} border="none" />
          <AppText variant="caption" color="muted">{t('bodyMap.front')}</AppText>
        </View>
        <View className="items-center gap-1">
          <Body data={data} side="back" scale={scale} colors={BODY_COLORS} defaultFill={bodyColor} border="none" />
          <AppText variant="caption" color="muted">{t('bodyMap.back')}</AppText>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: BODY_MAIN_COLOR }} />
          <AppText variant="caption" color="muted">{t('exercises.detail.primary')}</AppText>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: BODY_SECONDARY_COLOR }} />
          <AppText variant="caption" color="muted">{t('exercises.detail.secondary')}</AppText>
        </View>
      </View>
    </View>
  )
})
