import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Search } from 'lucide-react-native'
import type { Exercise } from '@lyftr/shared'
import { AppText, IconButton } from '../ui'
import { client } from '../../lib/lyftr'
import { useTheme } from '../../theme/useTheme'
import { EQUIPMENT_LABEL } from '../../utils/exerciseUtils'
import { ExerciseImage } from './ExerciseImage'

interface Props {
  selectedIds: number[]
  onSelect: (exercise: Exercise) => void
  onClose: () => void
}

const MAX_SHOWN = 40

function PickerRow({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 px-3 py-3 active:bg-surface-muted/60"
    >
      <ExerciseImage url={exercise.image_url} />
      <View className="flex-1">
        <AppText variant="subheading" numberOfLines={1}>{exercise.name}</AppText>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
          {/* Neutral muscle chip: a whole scrolling list of loud per-muscle colors
              reads busy and there's no "best"/PR signal here to reserve color for —
              keep the taxonomy legible but let the exercise name be the hero. */}
          <View className="rounded border border-surface-border bg-surface-muted px-1.5 py-0.5">
            <AppText variant="caption" color="muted" className="capitalize">
              {exercise.muscle_group}
            </AppText>
          </View>
          {exercise.equipment && exercise.equipment !== 'other' ? (
            <AppText variant="caption" color="muted">
              {EQUIPMENT_LABEL[exercise.equipment] || exercise.equipment}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

// Port of web/components/ExercisePicker.tsx as a full-screen RN Modal (the web
// portals a fixed overlay; the caller conditionally mounts us the same way, so
// search state resets per open — a routed screen can't hand the picked Exercise
// back to the form without a store detour, hence Modal).
export function ExercisePicker({ selectedIds, onSelect, onClose }: Props) {
  const { accent, colors } = useTheme()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  // One debounced loader (250ms, web parity); the empty query is served instantly —
  // the client caches the unfiltered exercise list after the first fetch.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await client.exerciseAPI.list(query ? { q: query } : undefined)
        if (!cancelled) setExercises(data || [])
      } catch {
        // Web swallows picker fetch errors too — the empty state covers it.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const available = exercises.filter((e) => !selectedIds.includes(e.id))
  const shown = available.slice(0, MAX_SHOWN)

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-surface-border px-4 pb-4 pt-3">
          <IconButton icon={ArrowLeft} label="Close exercise picker" variant="ghost" size="md" onPress={onClose} />
          <View>
            {/* Large title (matches the sibling "Log Workout" screen title) — the
                18px heading read undersized for a full-screen surface. */}
            <AppText variant="title">Add Exercise</AppText>
            <AppText variant="caption" color="muted">{available.length} available</AppText>
          </View>
        </View>

        {/* Search — local composed input (not the shared Field, which has no leading
            slot) so the magnifier icon reads as a native search bar. Same value/
            onChangeText/behavior as before; only the chrome changed. */}
        <View className="border-b border-surface-border px-4 py-3">
          <View
            className="flex-row items-center gap-2.5 rounded-xl border border-surface-border px-3.5"
            style={{ minHeight: 48, backgroundColor: colors.overlay }}
          >
            <Search size={18} color={colors.txMuted} strokeWidth={2.2} />
            <TextInput
              className="flex-1 font-sans text-base text-tx-primary"
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, muscle, equipment…"
              placeholderTextColor={colors.txMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        </View>

        {/* List */}
        {loading && exercises.length === 0 ? (
          <View className="flex-row items-center justify-center gap-2 py-16">
            <ActivityIndicator color={accent} />
            <AppText variant="body" color="muted">Loading exercises…</AppText>
          </View>
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(e) => String(e.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
            // Inset hairline between rows (native list idiom): starts past the leading
            // media so the thumbnails read as a column, not boxed cells.
            ItemSeparatorComponent={() => <View className="ml-[56px] h-px bg-surface-border/60" />}
            renderItem={({ item }) => <PickerRow exercise={item} onPress={() => onSelect(item)} />}
            ListEmptyComponent={
              <View className="items-center py-16">
                <AppText variant="body" color="muted">No exercises found</AppText>
              </View>
            }
            ListFooterComponent={
              available.length > MAX_SHOWN ? (
                <AppText variant="caption" color="muted" className="py-3 text-center">
                  Showing {MAX_SHOWN} of {available.length} — refine search
                </AppText>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  )
}
