import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native'
import Body, { type Slug } from 'react-native-body-highlighter'
import { useTranslation } from '@lyftr/shared'
import { Check, X } from '../ui/icons'
import { AppText } from '../ui/Typography'
import { SegmentedControl } from '../ui/SegmentedControl'
import { IconTileGroup } from '../ui/IconTileGroup'
import { CollapsibleChips } from '../ui/CollapsibleChips'
import { interactive, TOUCH_MIN } from '../ui/interaction'
import { BODY_COLORS, BODY_MAIN_COLOR, BODY_SECONDARY_COLOR, bodyFill } from './bodyFigure'
import { useTheme } from '../../theme/useTheme'
import { bodySlugToMuscle, muscleChipLabel, muscleToBodySlugs } from '../../utils/exerciseUtils'

export interface MuscleGroup {
  key: string
  label: string
  muscles: readonly { value: string; label: string }[]
}

type Props = {
  /** The list view's headings; every muscle the picker offers is under exactly one. */
  groups: readonly MuscleGroup[]
} & (
  | {
    /** Picks the one main muscle. */
    mode?: 'single'
    value: string | null
    onChange: (muscle: string) => void
    /** Others worked, drawn in the darker colour. Not selectable here. */
    secondary?: readonly string[]
    /** A muscle is required and none is picked: the "nothing picked" line gives way to the message. */
    invalid?: boolean
  }
  | {
    /** Toggles the other muscles worked. */
    mode: 'multi'
    value: readonly string[]
    onChange: (muscles: string[]) => void
    /** Drawn in the brighter colour and named, but not toggled from here. */
    main?: string | null
    /** At most this many; past it a tap says why instead of adding. */
    max?: number
  }
)

// Regions that are not a muscle group (they would only swallow taps near the real ones).
const INERT: Slug[] = ['head', 'hair', 'hands', 'feet', 'knees', 'ankles']
const SIDES = ['front', 'back'] as const
const FIGURE_W = 200
const FIGURE_GAP = 16

function Figures({ main, others, onPick, width }: { main: string | null; others: readonly string[]; onPick: (muscle: string) => void; width: number }) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const mainSlugs = main ? muscleToBodySlugs(main) : []
  const otherSlugs = others.flatMap((m) => muscleToBodySlugs(m)).filter((s) => !mainSlugs.includes(s))
  const data = [
    ...mainSlugs.map((slug) => ({ slug: slug as Slug, intensity: 2 })),
    ...otherSlugs.map((slug) => ({ slug: slug as Slug, intensity: 1 })),
  ]
  const pick = (slug: string) => {
    if ((INERT as readonly string[]).includes(slug)) return
    const m = bodySlugToMuscle(slug)
    if (m) onPick(m)
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

// The figure's colour beside a name, so the chips read as a key to the drawing.
const Swatch = ({ color }: { color: string }) => <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />

// Pick by tapping the body, or from a list. Both write the same value; the list is the precise
// one (the map cannot tell lats from middle back) and the one a screen reader gets, so it is
// where the picker opens while one is running. Single picks the main muscle; multi toggles the
// others, with the main drawn and named but left to its own picker.
export function BodyMapPicker(props: Props) {
  const { groups } = props
  const { t } = useTranslation()
  const { accent, colors } = useTheme()
  const [view, setView] = useState<'map' | 'list'>('map')
  const [width, setWidth] = useState(280)
  const [note, setNote] = useState('')
  const chosen = useRef(false)

  useEffect(() => {
    // react-native-web answers true here whatever is running, so it is a native question only.
    if (Platform.OS === 'web') return
    let live = true
    AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (live && on && !chosen.current) setView('list') }).catch(() => {})
    return () => { live = false }
  }, [])

  const multi = props.mode === 'multi'
  const main = multi ? props.main ?? null : props.value
  // "X is already the main muscle" stops being true once the main muscle changes.
  useEffect(() => { setNote('') }, [main])
  const others = multi ? props.value : props.secondary ?? []
  const full = multi && props.max !== undefined && props.value.length >= props.max
  const fullNote = multi && props.max !== undefined ? t('bodyMap.full', { max: props.max }) : ''

  const say = (msg: string) => {
    setNote(msg)
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(msg)
  }
  const toggle = (m: string) => {
    if (props.mode !== 'multi') return
    if (m === main) { say(t('bodyMap.isMain', { muscle: muscleChipLabel(m) })); return }
    if (props.value.includes(m)) { setNote(''); props.onChange(props.value.filter((x) => x !== m)); return }
    if (full) { say(fullNote); return }
    setNote('')
    props.onChange([...props.value, m])
  }
  const onPick = props.mode === 'multi' ? toggle : props.onChange
  // What a refused tap said, else the standing cap message while at the cap.
  const message = note || (full ? fullNote : '')

  // Others mean nothing until the main muscle is set: show the figure dimmed and inert, so two
  // identical empty maps don't stack, and the caller's hint says what comes first.
  if (multi && !main && props.value.length === 0) {
    return (
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none" style={{ opacity: 0.35 }}>
        <Figures main={null} others={[]} onPick={() => {}} width={width} />
      </View>
    )
  }

  const listGroups = groups.map((g) => (
    <View key={g.key} className="gap-1.5">
      <AppText variant="label" color="muted" className="uppercase" headingLevel={3}>{g.label}</AppText>
      {props.mode === 'multi' ? (
        <IconTileGroup
          multiple
          max={props.max}
          label={g.label}
          options={g.muscles.map((o) => (o.value === main ? { ...o, label: t('bodyMap.mainOption', { muscle: o.label }), disabled: true } : o))}
          value={props.value}
          onChange={(v) => { setNote(''); props.onChange(v) }}
        />
      ) : (
        <IconTileGroup label={g.label} options={g.muscles} value={props.value} onChange={props.onChange} />
      )}
    </View>
  ))

  const selected = props.mode === 'multi' ? (
    <View className="gap-2">
      {main ? (
        <View className="flex-row items-center gap-2">
          <Swatch color={BODY_MAIN_COLOR} />
          <AppText variant="caption" color="muted">{t('bodyMap.mainIs', { muscle: muscleChipLabel(main) })}</AppText>
        </View>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <AppText variant="caption" color="muted">{t('bodyMap.selected')}</AppText>
        {props.value.length === 0 ? <AppText variant="caption" color="muted">{t('bodyMap.nothingPicked')}</AppText> : null}
        <CollapsibleChips
          items={props.value}
          renderChip={(m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={t('bodyMap.remove', { muscle: muscleChipLabel(m) })}
                onPress={() => toggle(m)}
                style={{ minHeight: TOUCH_MIN }}
                className={`flex-row items-center gap-1.5 rounded-full border border-surface-border bg-surface-muted pl-3 pr-2.5 active:opacity-70 ${interactive('hover:bg-surface-border')}`}
              >
                <Swatch color={BODY_SECONDARY_COLOR} />
                <AppText variant="bodySemibold" className="text-[13px]">{muscleChipLabel(m)}</AppText>
                <X size={14} color={colors.txMuted} strokeWidth={2.5} />
              </Pressable>
          )}
        />
      </View>
    </View>
  ) : props.invalid && !props.value ? null : (
    <View className="flex-row items-center gap-2">
      <AppText variant="caption" color="muted">{t('bodyMap.selected')}</AppText>
      {props.value ? (
        <View className="flex-row items-center gap-1.5 rounded-full border border-brand-500 bg-brand-500/15 px-3 py-1.5">
          <Check size={14} color={accent} strokeWidth={3} />
          <AppText variant="bodySemibold" className="text-[13px]">{muscleChipLabel(props.value)}</AppText>
        </View>
      ) : (
        <AppText variant="caption" color="muted">{t('bodyMap.nothingPicked')}</AppText>
      )}
    </View>
  )

  return (
    <View className="gap-3" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <SegmentedControl
        options={[{ value: 'map', label: t('bodyMap.map') }, { value: 'list', label: t('bodyMap.list') }]}
        value={view}
        onChange={(v) => { chosen.current = true; setNote(''); setView(v) }}
      />
      {view === 'map' ? (
        <>
          <Figures main={main} others={others} onPick={onPick} width={width} />
          {selected}
        </>
      ) : (
        <View className="gap-3">{listGroups}</View>
      )}
      {multi ? (
        <View accessibilityLiveRegion="polite">
          {message ? <AppText variant="caption" color="warning">{message}</AppText> : null}
        </View>
      ) : null}
    </View>
  )
}
