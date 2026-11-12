import { Image, View } from 'react-native'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { Dumbbell } from '../../ui/icons'
import { useImageRetry } from '../../../hooks/useImageRetry'
import { useTheme } from '../../../theme/useTheme'
import { useGroupColors } from './colors'

export interface ExerciseThumbProps {
  url?: string
  /** Overlapping top-left tag, e.g. "A1". Omit for none. */
  tag?: string
  /** Colour of the tag and the no-image tile. */
  colorIndex?: number
  /** Square size in px. Default 48. */
  size?: number
}

// The exercise image, or a tinted dumbbell tile when there is none (or it failed to load),
// with the position tag overlapping its corner. Decorative: the row beside it names the exercise.
export function ExerciseThumb({ url, tag, colorIndex = 0, size = 48 }: ExerciseThumbProps) {
  const c = useGroupColors(colorIndex)
  const { colors } = useTheme()
  const { failed, key, onError } = useImageRetry(url)
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.29) }
  return (
    <View style={{ width: size, height: size }}>
      {/* The tile is always underneath, so a slow or missing image shows the dumbbell instead of a
          blank square; a loaded image simply paints over it. */}
      <View testID="thumb-fallback" className="items-center justify-center" style={[box, { backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }]}>
        <Icon icon={Dumbbell} size={Math.round(size / 2)} color={c.ink} strokeWidth={1.8} />
      </View>
      {url && !failed ? (
        <Image key={key} source={{ uri: url }} onError={onError} resizeMode="cover" style={[box, { position: 'absolute', left: 0, top: 0 }]} />
      ) : null}
      {tag ? (
        <View
          className="absolute -left-1.5 -top-1.5 rounded-lg px-1.5 py-0.5"
          style={{ backgroundColor: c.solid, borderWidth: 2, borderColor: colors.raised }}
        >
          <AppText variant="label" color="white" className="text-[11px] tracking-normal">{tag}</AppText>
        </View>
      ) : null}
    </View>
  )
}
