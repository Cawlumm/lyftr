import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { muscleColor, muscleLabel } from '../../utils/exerciseUtils'

// The one muscle chip: tint from the table, ink per theme (4.5:1 on the tint in both).
// `border` is the picker badge's outlined variant; `selfStart` stops a column parent stretching it.
export function MuscleBadge({ muscle, wide = false, border = false, selfStart = false }: {
  muscle: string
  wide?: boolean
  border?: boolean
  selfStart?: boolean
}) {
  // Re-renders on a language switch: the badge names the muscle from the catalog.
  useTranslation()
  const { colors, mode } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View
      className={`rounded py-0.5 ${wide ? 'px-2' : 'px-1.5'} ${selfStart ? 'self-start' : ''} ${tint?.chip ?? 'bg-surface-muted'} ${
        border ? `border ${tint?.border ?? 'border-surface-border'}` : ''
      }`}
    >
      {/* Tint via inline style - see exerciseUtils.ts for why not a className. */}
      <AppText variant="caption" className="capitalize" style={{ color: tint?.ink[mode] ?? colors.txMuted }}>
        {muscleLabel(muscle)}
      </AppText>
    </View>
  )
}
