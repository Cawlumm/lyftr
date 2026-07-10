import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft, BookOpen, ChevronRight, Play, Timer, Trash2, Zap } from 'lucide-react-native'
import type { ActiveSessionExercise, Program } from '@lyftr/shared'
import { AppText, IconButton, Screen } from '../../../src/components/ui'
import { client, useWorkoutSession } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Port of web/pages/StartWorkout.tsx. Quick-start (blank), start-from-program, and a
// resume/discard banner for an in-progress session. Navigates to /workouts/active,
// which itself opens the gym overlay when the layout pref is 'gym'.
export default function StartWorkout() {
  const session = useWorkoutSession((s) => s.session)
  const startSession = useWorkoutSession((s) => s.startSession)
  const cancelSession = useWorkoutSession((s) => s.cancelSession)
  const { colors, accent } = useTheme()

  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    client.programAPI
      .list()
      .then((data) => setPrograms(data || []))
      .catch(() => setError('Failed to load programs'))
      .finally(() => setLoading(false))
  }, [])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))

  const startQuick = () => {
    const name = `Workout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    startSession(name, [])
    router.push('/workouts/active')
  }

  const startFromProgram = (program: Program) => {
    const exercises: ActiveSessionExercise[] = (program.exercises || []).map((ex) => ({
      exercise_id: ex.exercise_id,
      exercise: ex.exercise,
      notes: ex.notes || '',
      rest_seconds: ex.rest_seconds,
      sets: (ex.sets || []).map((s) => ({
        set_number: s.set_number,
        target_reps: s.target_reps,
        target_weight: s.target_weight,
        actual_reps: s.target_reps,
        actual_weight: s.target_weight,
        completed: false,
        program_set_id: s.id,
      })),
    }))
    startSession(program.name, exercises, program.id)
    router.push('/workouts/active')
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-6 py-4">
          <View className="flex-row items-center gap-3">
            <IconButton icon={ArrowLeft} label="Back" variant="ghost" size="md" onPress={goBack} />
            <AppText variant="title">Start Workout</AppText>
          </View>

          {/* Active session — resume or discard */}
          {session ? (
            <View className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4">
              <View className="mb-4 flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl border border-warning-500/30 bg-warning-500/20">
                  <Timer size={20} color="#f59e0b" />
                </View>
                <View className="flex-1">
                  <AppText variant="bodySemibold" numberOfLines={1}>{session.name}</AppText>
                  <AppText variant="caption" style={{ color: '#f59e0b' }}>Workout in progress</AppText>
                </View>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => router.push('/workouts/active')}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 active:scale-95"
                >
                  <Play size={16} color="#ffffff" />
                  <AppText variant="bodySemibold" color="white">Resume</AppText>
                </Pressable>
                <Pressable
                  onPress={() => cancelSession()}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-muted py-2.5 active:scale-95"
                >
                  <Trash2 size={16} color={colors.txMuted} />
                  <AppText variant="bodySemibold" color="secondary">Discard</AppText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Quick start */}
          <Pressable
            onPress={startQuick}
            className="flex-row items-center gap-4 rounded-2xl border border-brand-500/20 bg-brand-500/10 p-5 active:scale-95"
          >
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
              <Zap size={24} color="#ffffff" />
            </View>
            <View className="flex-1">
              <AppText variant="heading">Quick Start</AppText>
              <AppText variant="caption" color="muted" className="mt-0.5">Start blank, add exercises as you go</AppText>
            </View>
            <ChevronRight size={20} color={colors.txMuted} />
          </Pressable>

          {/* Start from Program */}
          <View>
            <View className="mb-3 flex-row items-center gap-2">
              <BookOpen size={16} color={accent} />
              <AppText variant="subheading">Start from Program</AppText>
            </View>

            {error ? (
              <View className="mb-3 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
                <AppText variant="body" color="error">{error}</AppText>
              </View>
            ) : null}

            {loading ? (
              <View className="flex-row items-center justify-center gap-2 py-12">
                <ActivityIndicator color={accent} />
                <AppText variant="body" color="muted">Loading programs…</AppText>
              </View>
            ) : programs.length === 0 ? (
              <View className="items-center rounded-2xl border border-surface-border bg-surface-raised py-10">
                <BookOpen size={32} color={colors.txMuted} />
                <AppText variant="body" color="muted" className="mt-2">No programs yet</AppText>
                <Pressable onPress={() => router.navigate('/programs/new')} className="mt-3 active:opacity-60">
                  <AppText variant="caption" style={{ color: accent }}>Create your first program →</AppText>
                </Pressable>
              </View>
            ) : (
              <View className="gap-2">
                {programs.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => startFromProgram(p)}
                    className="flex-row items-center gap-3 rounded-2xl border border-surface-border bg-surface-raised p-4 active:bg-surface-muted"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                      <BookOpen size={20} color={accent} />
                    </View>
                    <View className="flex-1">
                      <AppText variant="bodySemibold" numberOfLines={1}>{p.name}</AppText>
                      <AppText variant="caption" color="muted" className="mt-0.5">{p.exercises?.length || 0} exercises</AppText>
                    </View>
                    <Play size={16} color={accent} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
