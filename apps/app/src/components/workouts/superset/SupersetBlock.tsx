import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { Check, Repeat } from '../../ui/icons'
import { useTheme } from '../../../theme/useTheme'
import { useGroupColors } from './colors'

/** Above this many rounds the header shows "Round 2 of 8" text instead of dots. */
export const MAX_ROUND_DOTS = 5

export interface SupersetBlockProps {
  /** From groupOf: "A", "B", ... */
  letter: string
  /** From groupColorIndex: picks the colour. */
  colorIndex: number
  /** Number of members. */
  count: number
  /** 0-based round in progress, as currentRound returns it (== total when all are done). */
  round: number
  /** From totalRounds. */
  total: number
  /** A session in progress. Off (templates, history, editors) shows "3 rounds" rather than a
   *  current-round marker that would imply progress the page doesn't have. */
  live?: boolean
  /** The members' content, with SupersetConnector between them. */
  children: ReactNode
  /** Usually a SupersetRestFooter. */
  footer?: ReactNode
  testID?: string
}

function RoundDots({ round, total, colorIndex }: { round: number; total: number; colorIndex: number }) {
  const c = useGroupColors(colorIndex)
  const { colors } = useTheme()
  return (
    <View className="flex-row items-center gap-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {Array.from({ length: total }, (_, k) => {
        const done = k < round
        const current = k === round
        return (
          <View
            key={k}
            testID={done ? 'round-dot-done' : current ? 'round-dot-current' : 'round-dot-upcoming'}
            className="h-[22px] w-[22px] items-center justify-center rounded-full"
            style={{
              backgroundColor: done ? c.solid : current ? 'transparent' : colors.muted,
              borderWidth: current ? 2 : 0,
              borderColor: c.solid,
            }}
          >
            {done ? (
              <Icon icon={Check} size={12} color="#ffffff" strokeWidth={3.5} />
            ) : (
              <AppText variant="label" className="text-[11px] tracking-normal" style={{ color: current ? c.ink : colors.txSecondary }}>
                {k + 1}
              </AppText>
            )}
          </View>
        )
      })}
    </View>
  )
}

// One container for every member of a superset: a bordered card in the group's colour with a
// tinted header (loop icon, "Superset A", subtitle, round progress). The group is one labelled
// unit for screen readers; its members stay individually reachable inside it.
export function SupersetBlock({ letter, colorIndex, count, round, total, live = false, children, footer, testID }: SupersetBlockProps) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  const shown = Math.max(1, Math.min(round + 1, total))
  const roundText = t('workouts.superset.round', { n: shown, total })
  return (
    <View
      testID={testID}
      role="group"
      accessibilityLabel={live ? t('workouts.superset.groupLabel', { letter, count, n: shown, total }) : t('workouts.superset.groupLabelStatic', { letter, count, rounds: t('workouts.superset.roundsCount', { count: total }) })}
      className="overflow-hidden rounded-[22px] bg-surface-raised"
      style={{ borderWidth: 1.5, borderColor: c.border }}
    >
      <View className="flex-row items-center gap-2.5 py-3 pl-3.5 pr-3" style={{ backgroundColor: c.tint }}>
        <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: c.solid }}>
          <Icon icon={Repeat} size={18} color="#ffffff" />
        </View>
        <View className="min-w-0 flex-1">
          <AppText variant="heading" className="text-base" numberOfLines={1}>
            {t('workouts.superset.label', { letter })}
          </AppText>
          <AppText variant="caption" className="font-sans-semibold" style={{ color: c.ink }} numberOfLines={2}>
            {t('workouts.superset.subtitle')}
          </AppText>
        </View>
        {!live ? (
          total > 0 ? (
            <AppText variant="caption" className="font-sans-bold" style={{ color: c.ink }}>{t('workouts.superset.roundsCount', { count: total })}</AppText>
          ) : null
        ) : total > MAX_ROUND_DOTS || total < 1 ? (
          total > 0 ? (
            <AppText variant="caption" className="font-sans-bold" style={{ color: c.ink }}>{roundText}</AppText>
          ) : null
        ) : (
          <RoundDots round={round} total={total} colorIndex={colorIndex} />
        )}
      </View>
      {children}
      {footer}
    </View>
  )
}
