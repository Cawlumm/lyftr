import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, usePathname } from 'expo-router'
import { ChevronRight, Timer } from 'lucide-react-native'
import { useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { useRestTimer } from '../../hooks/useRestTimer'
import { fmtClock } from '../../utils/workoutSets'

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Port of web Layout's ActiveSessionBar — the minimized session pill. Floats above the
// tab bar on every screen except: the gym overlay (gym layout, open) and the active
// screen itself (list layout). Tapping opens the gym overlay (gym) or the active
// screen (list). Carries the rest-countdown chip so "rest over" clears while minimized.
export function SessionPill() {
  const session = useWorkoutSession((s) => s.session)
  const openGym = useWorkoutSession((s) => s.openGym)
  const layout = useSettingsStore((s) => s.settings.workout_layout)
  const pathname = usePathname()
  const [elapsed, setElapsed] = useState(0)
  const { active: resting, paused, done, left } = useRestTimer()

  useEffect(() => {
    if (!session) return
    const started = new Date(session.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session])

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
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 90, zIndex: 40 }} className="items-center">
      <Pressable
        onPress={handlePress}
        className="flex-row items-center gap-2.5 rounded-full bg-brand-500 px-4 py-2.5 shadow-lg active:scale-95"
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-white/20">
          <Timer size={12} color="#ffffff" />
        </View>
        <View>
          <Text className="font-sans-bold text-xs text-white" numberOfLines={1} style={{ maxWidth: 140 }}>{session.name}</Text>
          <Text className="text-[11px] text-white/70">{completedSets}/{totalSets} sets · {formatElapsed(elapsed)}</Text>
        </View>
        {resting ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/15 py-1 pl-2.5 pr-1">
            <Text className="text-[10px] font-sans-semibold uppercase text-white/70">{done ? 'Rest over' : paused ? 'Paused' : 'Rest'}</Text>
            {!done ? <Text className="font-sans-bold text-xs text-white" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(left)}</Text> : null}
          </View>
        ) : null}
        <ChevronRight size={16} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  )
}
