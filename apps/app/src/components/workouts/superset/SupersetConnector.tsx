import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { ArrowDown } from '../../ui/icons'
import { useGroupColors } from './colors'

export interface SupersetConnectorProps {
  /** Name of the member that follows. */
  nextName: string
  colorIndex: number
}

// The joint between two members of a block: a centred "Straight to Row, no rest" pill on a
// hairline. Not interactive.
export function SupersetConnector({ nextName, colorIndex }: SupersetConnectorProps) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  return (
    <View className="flex-row items-center gap-2 px-3.5 py-1.5">
      <View className="h-px flex-1" style={{ backgroundColor: c.border }} />
      <View className="max-w-[80%] flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ backgroundColor: c.tint }}>
        <Icon icon={ArrowDown} size={14} color={c.ink} strokeWidth={2.4} />
        <AppText variant="caption" className="shrink font-sans-bold" style={{ color: c.ink }}>
          {t('workouts.superset.straightTo', { name: nextName })}
        </AppText>
      </View>
      <View className="h-px flex-1" style={{ backgroundColor: c.border }} />
    </View>
  )
}
