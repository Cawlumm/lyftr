import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import Body, { type Slug } from 'react-native-body-highlighter'
import { useTranslation } from '@lyftr/shared'
import { Check } from '../ui/icons'
import { AppText } from '../ui/Typography'
import { SegmentedControl } from '../ui/SegmentedControl'
import { IconTileGroup } from '../ui/IconTileGroup'
import { BODY_COLORS, bodyFill } from './bodyFigure'
import { useTheme } from '../../theme/useTheme'
import { bodySlugToMuscle, muscleChipLabel, muscleToBodySlugs } from '../../utils/exerciseUtils'

export interface MuscleGroup {
  key: string
  label: string
  muscles: readonly { value: string; label: string }[]
}

interface Props {
  /** The main muscle, in our muscle slugs. */
  value: string | null
  /** Others worked, drawn in the darker colour. Not selectable here. */
  secondary?: readonly string[]
  onChange: (muscle: string) => void
  /** The list view's headings; every muscle the picker offers is under exactly one. */
  groups: readonly MuscleGroup[]
  /** A muscle is required and none is picked: the "nothing picked" line gives way to the message. */
  invalid?: boolean
}

// Regions that are not a muscle group (they would only swallow taps near the real ones).
const INERT: Slug[] = ['head', 'hair', 'hands', 'feet', 'knees', 'ankles']
const SIDES = ['front', 'back'] as const
const FIGURE_W = 200
const FIGURE_GAP = 16

function Figures({ value, secondary, onChange, width }: Pick<Props, 'value' | 'secondary' | 'onChange'> & { width: number }) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const main = value ? muscleToBodySlugs(value) : []
  const others = (secondary ?? []).flatMap((m) => muscleToBodySlugs(m)).filter((s) => !main.includes(s))
  const data = [
    ...main.map((slug) => ({ slug: slug as Slug, intensity: 2 })),
    ...others.map((slug) => ({ slug: slug as Slug, intensity: 1 })),
  ]
  const pick = (slug: string) => {
    if ((INERT as readonly string[]).includes(slug)) return
    const m = bodySlugToMuscle(slug)
    if (m) onChange(m)
  }
  const scale = Math.min(0.95, Math.max(0.5, (width - FIGURE_GAP) / 2 / FIGURE_W))
  // The figures are decorative for a screen reader: the List view holds the same choice as
  // labelled controls.
  const hidden = Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
  return (
    <View {...hidden} {...webRegionClick(pick)} className="flex-row items-start justify-center" style={{ gap: FIGURE_GAP }}>
      {SIDES.map((side) => (
        <View key={side} className="items-center gap-1">
          <Body
            data={data} side={side} scale={scale} colors={BODY_COLORS} defaultFill={bodyFill(isDark)} border="none"
            disabledParts={INERT}
            onBodyPartPress={(part) => { if (part.slug) pick(part.slug) }}
          />
          <AppText variant="caption" color="muted">{t(side === 'front' ? 'bodyMap.front' : 'bodyMap.back')}</AppText>
        </View>
      ))}
    </View>
  )
}

// On web the figure's regions carry no handler (patches/react-native-body-highlighter: a press
// handler there leaks responder props onto the DOM); the click is read here from the <path id>,
// which the library sets to the region's slug.
function webRegionClick(pick: (slug: string) => void): object {
  if (Platform.OS !== 'web') return {}
  return {
    onClick: (e: { target: unknown }) => {
      const path = (e.target as Element | null)?.closest?.('path[id]')
      if (path?.id) pick(path.id)
    },
  }
}

// Pick a muscle by tapping the body, or from a list. Both write the same value; the list is the
// precise one (the map cannot tell lats from middle back) and the one a screen reader gets, so
// it is where the picker opens while one is running.
export function BodyMapPicker({ value, secondary, onChange, groups, invalid }: Props) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const [view, setView] = useState<'map' | 'list'>('map')
  const [width, setWidth] = useState(280)
  const chosen = useRef(false)

  useEffect(() => {
    // react-native-web answers true here whatever is running, so it is a native question only.
    if (Platform.OS === 'web') return
    let live = true
    AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (live && on && !chosen.current) setView('list') }).catch(() => {})
    return () => { live = false }
  }, [])

  return (
    <View className="gap-3" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <SegmentedControl
        options={[{ value: 'map', label: t('bodyMap.map') }, { value: 'list', label: t('bodyMap.list') }]}
        value={view}
        onChange={(v) => { chosen.current = true; setView(v) }}
      />
      {view === 'map' ? (
        <>
          <Figures value={value} secondary={secondary} onChange={onChange} width={width} />
          {invalid && !value ? null : <View className="flex-row items-center gap-2">
            <AppText variant="caption" color="muted">{t('bodyMap.selected')}</AppText>
            {value ? (
              <View className="flex-row items-center gap-1.5 rounded-full border border-brand-500 bg-brand-500/15 px-3 py-1.5">
                <Check size={14} color={accent} strokeWidth={3} />
                <AppText variant="bodySemibold" className="text-[13px]">{muscleChipLabel(value)}</AppText>
              </View>
            ) : (
              <AppText variant="caption" color="muted">{t('bodyMap.nothingPicked')}</AppText>
            )}
          </View>}
        </>
      ) : (
        <View className="gap-3">
          {groups.map((g) => (
            <View key={g.key} className="gap-1.5">
              <AppText variant="label" color="muted" className="uppercase" accessibilityRole="header">{g.label}</AppText>
              <IconTileGroup label={g.label} options={g.muscles} value={value} onChange={onChange} />
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
