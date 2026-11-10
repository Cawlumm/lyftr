import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { Icon } from '../../ui/Icon'
import { ArrowDown } from '../../ui/icons'
import { useGroupColors } from './colors'

export interface SupersetConnectorProps {
  /** Name of the member that follows. */
  nextName: string
  colorIndex: number
}

// The joint between two members of a block: a down arrow on a hairline means "go straight to
// the next one". The block header already says rest comes after the round, so the arrow carries
// no words; screen readers (and the web tooltip) get the full sentence. Not interactive.
export function SupersetConnector({ nextName, colorIndex }: SupersetConnectorProps) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  const label = t('workouts.superset.straightTo', { name: nextName })
  return (
    <View className="flex-row items-center gap-2 px-3.5 py-1">
      <View className="h-px flex-1" style={{ backgroundColor: c.border }} />
      <View
        role="img"
        aria-label={label}
        accessibilityLabel={label}
        // @ts-expect-error title is a react-native-web prop (tooltip); native ignores it
        title={label}
        className="h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }}
      >
        <Icon icon={ArrowDown} size={15} color={c.ink} strokeWidth={2.4} />
      </View>
      <View className="h-px flex-1" style={{ backgroundColor: c.border }} />
    </View>
  )
}
