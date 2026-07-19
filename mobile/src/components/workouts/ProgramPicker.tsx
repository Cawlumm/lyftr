import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, View } from 'react-native'
import { AlertCircle, BookOpen, ChevronRight, Dumbbell, Moon, X } from 'lucide-react-native'
import type { Program, ProgramDay } from '@lyftr/shared'
import { workoutDays, dayLabel } from '@lyftr/shared'
import { AppText, EmptyState, Field, IconButton } from '../ui'
import { client } from '../../lib/lyftr'
import { useTheme } from '../../theme/useTheme'

interface Props {
  onSelect: (program: Program, day: ProgramDay) => void
  onClose: () => void
}

// Port of web/components/ProgramPicker.tsx: dimmed overlay + centered card, with the
// same two-step pick-a-program-then-pick-a-day flow (a single-workout-day program
// skips the day step, same as web). One directed addition over web: a search field —
// client-side name filter, since the program list is a single un-paginated fetch.
export function ProgramPicker({ onSelect, onClose }: Props) {
  const { colors, brand, accent, isDark } = useTheme()
  const [programs, setPrograms] = useState<Program[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dayPickFor, setDayPickFor] = useState<Program | null>(null)

  useEffect(() => {
    client.programAPI.list()
      .then((data) => setPrograms(data || []))
      .catch(() => setError('Failed to load programs'))
      .finally(() => setLoading(false))
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? programs.filter((p) => p.name.toLowerCase().includes(q)) : programs
  }, [programs, query])

  const pickProgram = (p: Program) => {
    const days = workoutDays(p)
    if (days.length === 0) return
    if (days.length === 1) { onSelect(p, days[0]); return }
    setDayPickFor(p)
  }

  const title = dayPickFor ? dayPickFor.name : 'Load from Program'
  const subtitle = dayPickFor ? 'Pick a day to pre-fill exercises' : 'Pick a program to pre-fill exercises'

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dayPickFor ? () => setDayPickFor(null) : onClose}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        {/* maxHeight is layout math NativeWind percentages don't cover reliably — inline. */}
        <View className="w-full rounded-2xl border border-surface-border bg-surface-base" style={{ maxHeight: '80%' }}>
          <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
            <View className="flex-1 pr-2">
              <AppText variant="heading" numberOfLines={1}>{title}</AppText>
              <AppText variant="caption" color="muted" className="mt-0.5">{subtitle}</AppText>
            </View>
            <IconButton
              icon={X}
              label="Close program picker"
              variant="ghost"
              size="md"
              onPress={dayPickFor ? () => setDayPickFor(null) : onClose}
            />
          </View>

          {dayPickFor ? (
            <FlatList
              data={workoutDays(dayPickFor)}
              keyExtractor={(d, i) => String(d.id ?? i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: day }) => {
                const isToday = (dayPickFor.days ?? [])[dayPickFor.current_day_index]?.id === day.id
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelect(dayPickFor, day)}
                    className="flex-row items-center gap-3 border-b border-surface-border px-4 py-3 active:bg-surface-muted"
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10">
                      <Dumbbell size={16} color={accent} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <AppText variant="subheading" numberOfLines={1}>{dayLabel(day, day.order_index)}</AppText>
                        {isToday ? (
                          <View className="rounded-full bg-brand-500/15 px-1.5 py-0.5">
                            <AppText variant="caption" style={{ color: accent }}>TODAY</AppText>
                          </View>
                        ) : null}
                      </View>
                      <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">
                        {(day.exercises ?? []).length} exercises
                      </AppText>
                    </View>
                    <ChevronRight size={16} color={colors.txMuted} />
                  </Pressable>
                )
              }}
            />
          ) : (
            <>
              <View className="border-b border-surface-border px-4 py-3">
                <Field
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search programs…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>

              {loading ? (
                <View className="flex-row items-center justify-center gap-2 p-8">
                  <ActivityIndicator color={accent} />
                  <AppText variant="body" color="muted">Loading programs…</AppText>
                </View>
              ) : error ? (
                <View className="flex-row items-center gap-2 p-4">
                  <AlertCircle size={16} color={isDark ? brand.errorSoft : brand.error} />
                  <AppText variant="body" color="error">{error}</AppText>
                </View>
              ) : shown.length === 0 ? (
                <EmptyState
                  compact
                  icon={BookOpen}
                  title={query ? 'No matching programs' : 'No programs yet'}
                  subtitle={query ? 'Try a different search' : 'Create a program first'}
                />
              ) : (
                <FlatList
                  data={shown}
                  keyExtractor={(p) => String(p.id)}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const days = workoutDays(item)
                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={days.length === 0}
                        onPress={() => pickProgram(item)}
                        className={`flex-row items-center gap-3 border-b border-surface-border px-4 py-3 active:bg-surface-muted ${days.length === 0 ? 'opacity-40' : ''}`}
                      >
                        <View className="h-9 w-9 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10">
                          <BookOpen size={16} color={accent} />
                        </View>
                        <View className="flex-1">
                          <AppText variant="subheading" numberOfLines={1}>{item.name}</AppText>
                          <View className="mt-0.5 flex-row items-center gap-1.5">
                            <Dumbbell size={12} color={colors.txMuted} />
                            <AppText variant="caption" color="muted" numberOfLines={1}>
                              {days.length === 0 ? 'No exercises yet' : `${days.length} workout day${days.length === 1 ? '' : 's'}`}
                            </AppText>
                            {(item.days ?? []).some((d) => d.is_rest_day) ? (
                              <Moon size={12} color={colors.txMuted} />
                            ) : null}
                          </View>
                        </View>
                        <ChevronRight size={16} color={colors.txMuted} />
                      </Pressable>
                    )
                  }}
                />
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}
