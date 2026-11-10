import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { Timer } from '../../ui/icons'
import { useGroupColors } from './colors'

export interface SupersetRestFooterProps {
  /** Already formatted, e.g. restLabel(75) or "1:15". */
  rest: string
  /** The member the round ends on (its rest is the one used, as roundRest says). */
  afterName: string
  /** 1-based number of the round that follows. Omit (or null) for the last round. */
  nextRound?: number | null
  colorIndex: number
}

// "Rest 1:15 after Row, then round 3" (last round: "Rest 1:15 after Row"), at the block's foot.
export function SupersetRestFooter({ rest, afterName, nextRound, colorIndex }: SupersetRestFooterProps) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  const text = nextRound
    ? t('workouts.superset.restThen', { rest, name: afterName, n: nextRound })
    : t('workouts.superset.restThenLast', { rest, name: afterName })
  return (
    <View className="flex-row items-center gap-2 border-t border-surface-border bg-surface-base px-3.5 py-2.5">
      <Icon icon={Timer} size={16} color={c.ink} />
      <AppText variant="body" className="flex-1 text-[13px]">{text}</AppText>
    </View>
  )
}
