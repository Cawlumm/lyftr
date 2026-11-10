import { useEffect, useId, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { Link2, Repeat, Timer } from '../../ui/icons'
import { Sheet } from '../../ui/Sheet'
import { SheetButton } from '../../ui/SheetButton'
import { interactive } from '../../ui/interaction'
import { useTheme } from '../../../theme/useTheme'
import { ExerciseThumb } from './ExerciseThumb'
import { useGroupColors } from './colors'

export interface SupersetCandidate {
  /** Index in the caller's exercise list; this is what onCreate receives. */
  index: number
  name: string
  /** Primary muscle, already localised. Omit when unknown. */
  muscle?: string
  imageUrl?: string
}

export interface SupersetSheetProps {
  visible: boolean
  /** Name of the exercise being paired. */
  currentName: string
  candidates: SupersetCandidate[]
  /** A candidate's `index` to select on open (the pill's neighbour); otherwise nothing is selected. */
  preselect?: number
  /** Rest after each round, already formatted (restLabel). The note is hidden without it. */
  restLabel?: string
  /** Index of the exercise the sheet was opened from, to tell whether picking it moves anything. */
  currentIndex?: number
  /** The caller applies pairWith and closes the sheet. */
  onCreate: (partnerIndex: number) => void
  onClose: () => void
}

function Illustration() {
  const c = useGroupColors(0)
  const box = 'h-10 w-10 items-center justify-center rounded-xl'
  return (
    <View className="h-14 w-[84px]" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <View className={`absolute left-0 top-2 ${box}`} style={{ backgroundColor: c.solid }}>
        <AppText variant="heading" color="white" className="text-[15px]">A</AppText>
      </View>
      <View className={`absolute right-0 top-2 ${box}`} style={{ backgroundColor: c.tint, borderWidth: 2, borderColor: c.solid }}>
        <AppText variant="heading" className="text-[15px]" style={{ color: c.ink }}>B</AppText>
      </View>
      <View className="absolute left-0 right-0 top-[14px] z-10 items-center">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-raised" style={{ borderWidth: 1.5, borderColor: c.border }}>
          <Icon icon={Repeat} size={15} color={c.ink} />
        </View>
      </View>
    </View>
  )
}

// "Make a superset": pick the exercise to alternate with. Built on Sheet, so scrim, grabber,
// dialog-on-wide-web and Escape are the app's. Selection is a radio group; each row is one
// 64px-tall control.
export function SupersetSheet({
  visible, currentName, candidates, preselect, restLabel, currentIndex, onCreate, onClose,
}: SupersetSheetProps) {
  const { t } = useTranslation()
  const { accent, colors } = useTheme()
  const c = useGroupColors(0)
  const titleId = useId()
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => {
    if (visible) setPicked(candidates.some((x) => x.index === preselect) ? (preselect as number) : null)
    // Re-seeds on open only: candidates change identity every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preselect])
  const chosen = candidates.find((x) => x.index === picked)

  return (
    <Sheet open={visible} onClose={onClose} haptic="selection" labelledBy={titleId} width="md">
      <View className="gap-4 px-[18px]">
        <View className="flex-row items-center gap-3">
          <Illustration />
          <View className="min-w-0 flex-1 gap-1">
            <AppText nativeID={titleId} variant="heading" className="text-xl">{t('workouts.superset.sheet.title')}</AppText>
            <AppText variant="caption" color="secondary" className="text-[13px] leading-[18px]">{t('workouts.superset.sheet.body')}</AppText>
          </View>
        </View>

        <View className="gap-1.5">
          <AppText variant="label" color="secondary" className="text-[11px]">
            {t('workouts.superset.sheet.pairWith', { name: currentName })}
          </AppText>
          {candidates.length === 0 ? (
            <AppText variant="body" color="muted">{t('workouts.superset.sheet.empty')}</AppText>
          ) : (
            <ScrollView style={{ maxHeight: 280 }} role="radiogroup" accessibilityLabel={t('workouts.superset.sheet.pairWith', { name: currentName })}>
              <View className="gap-1.5">
                {candidates.map((cand) => {
                  const on = cand.index === picked
                  const moves = currentIndex !== undefined && Math.abs(cand.index - currentIndex) > 1
                  const sub = moves
                    ? cand.muscle
                      ? t('workouts.superset.sheet.movesNextTo', { muscle: cand.muscle, name: currentName })
                      : t('workouts.superset.sheet.moves', { name: currentName })
                    : cand.muscle
                  return (
                    <Pressable
                      key={cand.index}
                      accessibilityRole="radio"
                      accessibilityLabel={cand.name}
                      accessibilityState={{ checked: on }}
                      onPress={() => setPicked(cand.index)}
                      className={`min-h-[64px] flex-row items-center gap-3 rounded-2xl px-3 py-2 ${interactive('hover:bg-surface-muted')}`}
                      style={{ borderWidth: on ? 2 : 1, borderColor: on ? accent : colors.border, backgroundColor: on ? c.tint : undefined }}
                    >
                      <ExerciseThumb url={cand.imageUrl} size={48} colorIndex={0} />
                      <View className="min-w-0 flex-1 gap-0.5">
                        <AppText variant="subheading" className="text-[15px]" numberOfLines={2}>{cand.name}</AppText>
                        {sub ? <AppText variant="caption" color="secondary" numberOfLines={1}>{sub}</AppText> : null}
                      </View>
                      <View
                        className="h-[22px] w-[22px] items-center justify-center rounded-full"
                        style={{ borderWidth: 2, borderColor: on ? accent : colors.txMuted }}
                      >
                        {on ? <View className="h-[10px] w-[10px] rounded-full" style={{ backgroundColor: accent }} /> : null}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {restLabel && chosen ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl bg-surface-muted px-3 py-2.5">
            <Icon icon={Timer} size={16} color={accent} />
            <AppText variant="body" className="flex-1 text-[13px]">
              {t('workouts.superset.sheet.restNote', { rest: restLabel, name: chosen.name })}
            </AppText>
          </View>
        ) : null}

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <SheetButton label={t('workouts.superset.sheet.cancel')} variant="muted" onPress={onClose} />
          </View>
          <View className="flex-[2]">
            <SheetButton
              label={t('workouts.superset.sheet.create')}
              variant="primary"
              icon={Link2}
              disabled={picked === null}
              onPress={() => picked !== null && onCreate(picked)}
            />
          </View>
        </View>
      </View>
    </Sheet>
  )
}
