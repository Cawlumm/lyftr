import { View } from 'react-native'
import { groupOf, restLabel, useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { Pause } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'
import { SupersetMarker, SupersetRail } from './SupersetMarker'

type Row = { superset_group?: number | null }

export interface SupersetPlace {
  letter: string
  position: number
  total: number
  first: boolean
  last: boolean
}

export function supersetPlace(rows: Row[] | null | undefined, i: number): SupersetPlace | null {
  const list = rows ?? []
  const g = groupOf(list, i)
  if (!g) return null
  return { letter: g.letter, position: i - g.start + 1, total: g.end - g.start + 1, first: i === g.start, last: i === g.end }
}

export function SupersetCardAccent({ place }: { place: SupersetPlace | null }) {
  if (!place) return null
  return <SupersetRail first={place.first} last={place.last} />
}

export function SupersetCardBadge({ place }: { place: SupersetPlace | null }) {
  if (!place) return null
  return (
    <View className="mb-1">
      <SupersetMarker letter={place.letter} position={place.position} total={place.total} />
    </View>
  )
}

// Members before the last carry no rest of their own: the round rests once, after its last member.
export function ReadOnlyRest({ place, restSeconds }: { place: SupersetPlace | null; restSeconds: number | null | undefined }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  if (place && !place.last) return null
  if (restSeconds === 0) return <AppText variant="caption" color="muted">{t('common.rest.none')}</AppText>
  const label = restLabel(restSeconds ?? 90)
  return (
    <View className="flex-row items-center gap-1">
      <Pause size={13} color={colors.txMuted} />
      <AppText variant="caption" color="muted">
        {place ? t('workouts.superset.restAfterRound', { rest: label }) : label}
      </AppText>
    </View>
  )
}

export function useSupersetCardLabel() {
  const { t } = useTranslation()
  return (place: SupersetPlace | null, name: string | undefined) =>
    place
      ? `${t('workouts.superset.position', { letter: place.letter, position: place.position, total: place.total })}: ${name ?? ''}`
      : name
}
