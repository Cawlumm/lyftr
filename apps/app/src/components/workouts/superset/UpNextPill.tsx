import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { ArrowRight } from '../../ui/icons'
import { useGroupColors } from './colors'

export interface UpNextPillProps {
  colorIndex?: number
}

// Marks the member to do next in a round. Text plus arrow, so it never leans on colour.
export function UpNextPill({ colorIndex = 0 }: UpNextPillProps) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: c.solid }}>
      <Icon icon={ArrowRight} size={12} color="#ffffff" strokeWidth={3} />
      <AppText variant="label" color="white" className="text-[11px] tracking-normal">{t('workouts.superset.upNext')}</AppText>
    </View>
  )
}
