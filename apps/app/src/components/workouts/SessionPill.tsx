import { Platform, Pressable, Text, View } from 'react-native'
import { router, usePathname } from 'expo-router'
import { ChevronRight, Timer } from '../ui/icons'
import { useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { useRestTimer } from '../../hooks/useRestTimer'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { interactive } from '../ui/interaction'
import { fmtClock, formatElapsed, useElapsedSeconds, useTranslation } from '@lyftr/shared'

// Port of web Layout's ActiveSessionBar — the minimized session pill. Floats above the
// tab bar on every screen except: the gym overlay (gym layout, open) and the active
// screen itself (list layout). Tapping opens the gym overlay (gym) or the active
// screen (list). Carries the rest-countdown chip so "rest over" clears while minimized.
// Room a scroller leaves under its last row while the pill floats over the bottom of it, so
// that row can still scroll clear. The one screen without the pill (active) does not ask.
// Selects a boolean, not the session: 29 screens call this and stay mounted under a live workout,
// and selecting the session object re-rendered all of them on every set tick.
export function useSessionPillInset(): number {
  return useWorkoutSession((s) => s.session !== null) ? 64 : 0
}

export function SessionPill() {
  const { t } = useTranslation()
  const session = useWorkoutSession((s) => s.session)
  const openGym = useWorkoutSession((s) => s.openGym)
  const layout = useSettingsStore((s) => s.settings.workout_layout)
  const pathname = usePathname()
  const elapsed = useElapsedSeconds(session?.started_at)
  const { active: resting, paused, done, left } = useRestTimer()
  // Beside the web sidebar there is no bottom bar to clear, and the pill centres on the content.
  const { lg } = useBreakpoint()
  const beside = Platform.OS === 'web' && lg
  // The sidebar publishes its width as --shell-inset (Sidebar.tsx); reading it keeps this in step
  // with ContentColumn's centring rather than a second copy of the number. Not a DimensionValue.
  const inset = beside ? ('var(--shell-inset, 0px)' as unknown as number) : 0

  if (!session) return null
  // Hidden only on the active screen itself (the gym overlay or the list active UI lives
  // there); shown on every other tab as the resume shortcut so a running session is never
  // trapping you on one tab.
  if (pathname === '/workouts/active') return null

  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter((set) => set.completed).length, 0)
  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)

  const handlePress = () => {
    // Both layouts land on the active screen (gym renders its overlay there); openGym keeps
    // the gym flag consistent. navigate (not push): the pill fires from any tab, so this is
    // a cross-tab jump — push corrupts the native tab/back stack.
    if (layout === 'gym') openGym()
    router.navigate('/workouts/active')
  }

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: inset, right: 0, bottom: beside ? 24 : 90, zIndex: 40 }} className="items-center">
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        className={`flex-row items-center gap-2.5 rounded-full bg-brand-500 px-4 py-2.5 shadow-lg active:scale-95 ${interactive('hover:bg-brand-600')}`}
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-white/20">
          <Timer size={12} color="#ffffff" />
        </View>
        <View>
          <Text className="font-sans-bold text-xs text-white" numberOfLines={1} style={{ maxWidth: 140 }}>{session.name}</Text>
          <Text className="text-[11px] text-white/70">{t('workouts.active.setProgress', { done: completedSets, total: totalSets })} · {formatElapsed(elapsed)}</Text>
        </View>
        {resting ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
            <Text className="text-[10px] font-sans-semibold uppercase text-white/70">{done ? t('workouts.rest.label.over') : paused ? t('workouts.rest.label.paused') : t('nav.session.rest')}</Text>
            {!done ? <Text className="font-sans-bold text-xs text-white" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(left)}</Text> : null}
          </View>
        ) : null}
        <ChevronRight size={16} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  )
}
