import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, View } from 'react-native'
import { AlertCircle, BookOpen, ChevronRight, Dumbbell, X } from 'lucide-react-native'
import type { Program } from '@lyftr/shared'
import { AppText, EmptyState, Field, IconButton } from '../ui'
import { client } from '../../lib/lyftr'
import { useTheme } from '../../theme/useTheme'

interface Props {
  onSelect: (program: Program) => void
  onClose: () => void
}

// Port of web/components/ProgramPicker.tsx: dimmed overlay + centered card. One
// directed addition over web: a search field — client-side name filter, since the
// program list is a single un-paginated fetch.
export function ProgramPicker({ onSelect, onClose }: Props) {
  const { colors, brand, accent, isDark } = useTheme()
  const [programs, setPrograms] = useState<Program[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        {/* maxHeight is layout math NativeWind percentages don't cover reliably — inline. */}
        <View className="w-full rounded-2xl border border-surface-border bg-surface-base" style={{ maxHeight: '80%' }}>
          <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
            <View>
              <AppText variant="heading">Load from Program</AppText>
              <AppText variant="caption" color="muted" className="mt-0.5">Pick a program to pre-fill exercises</AppText>
            </View>
            <IconButton icon={X} label="Close program picker" variant="ghost" size="md" onPress={onClose} />
          </View>

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
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSelect(item)}
                  className="flex-row items-center gap-3 border-b border-surface-border px-4 py-3 active:bg-surface-muted"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10">
                    <BookOpen size={16} color={accent} />
                  </View>
                  <View className="flex-1">
                    <AppText variant="subheading" numberOfLines={1}>{item.name}</AppText>
                    <View className="mt-0.5 flex-row items-center gap-1.5">
                      <Dumbbell size={12} color={colors.txMuted} />
                      <AppText variant="caption" color="muted" numberOfLines={1}>
                        {item.exercises?.length || 0} exercises{item.notes ? ` • ${item.notes}` : ''}
                      </AppText>
                    </View>
                  </View>
                  {/* Web reveals the chevron on hover; no hover on touch → always shown. */}
                  <ChevronRight size={16} color={colors.txMuted} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}
