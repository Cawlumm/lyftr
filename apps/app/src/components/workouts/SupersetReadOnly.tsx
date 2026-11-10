import type { ReactNode } from 'react'
import { View } from 'react-native'
import { groupColorIndex, groupOf, restLabel, useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { Pause } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'
import { SupersetBlock, SupersetConnector, SupersetRestFooter } from './superset'

type Row = { superset_group?: number | null; sets?: unknown[]; rest_seconds?: number | null; exercise?: { name?: string } | null }

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

export interface MemberSlot {
  index: number
  /** In a superset block: the caller drops its own card chrome and renders the thumb with `tag`. */
  grouped: boolean
  /** "A1", "A2"... only when grouped. */
  tag?: string
  colorIndex: number
}

// Walks the rows: a solo exercise renders as is, a linked run renders inside one SupersetBlock
// with a connector between members and a single rest footer (the round's last member's rest).
// Read-only pages carry no progress, so the block opens on round 1.
export function SupersetList<T extends Row>({
  rows,
  restOn,
  renderMember,
}: {
  rows: T[] | null | undefined
  restOn: boolean
  renderMember: (ex: T, slot: MemberSlot) => ReactNode
}) {
  const list = rows ?? []
  const out: ReactNode[] = []
  for (let i = 0; i < list.length; i++) {
    const g = groupOf(list, i)
    if (!g) {
      out.push(<View key={i}>{renderMember(list[i], { index: i, grouped: false, colorIndex: -1 })}</View>)
      continue
    }
    const colorIndex = Math.max(0, groupColorIndex(list, g.start))
    const items: ReactNode[] = []
    for (let k = g.start; k <= g.end; k++) {
      if (k > g.start) {
        items.push(<SupersetConnector key={`c${k}`} nextName={list[k].exercise?.name ?? ''} colorIndex={colorIndex} />)
      }
      items.push(
        <View key={k}>{renderMember(list[k], { index: k, grouped: true, tag: `${g.letter}${k - g.start + 1}`, colorIndex })}</View>,
      )
    }
    const last = list[g.end]
    const rest = last.rest_seconds
    let total = 0
    for (let k = g.start; k <= g.end; k++) total = Math.max(total, list[k].sets?.length ?? 0)
    out.push(
      <SupersetBlock
        key={`g${g.start}`}
        letter={g.letter}
        colorIndex={colorIndex}
        count={g.end - g.start + 1}
        round={0}
        total={total}
        footer={
          restOn && rest !== 0 ? (
            <SupersetRestFooter rest={restLabel(rest ?? 90)} afterName={last.exercise?.name ?? ''} nextRound={null} colorIndex={colorIndex} />
          ) : undefined
        }
      >
        {items}
      </SupersetBlock>,
    )
    i = g.end
  }
  return <>{out}</>
}
