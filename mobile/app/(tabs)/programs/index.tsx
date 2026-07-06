import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { BookOpen, Plus } from 'lucide-react-native'
import type { Program } from '@lyftr/shared'
import { AppText, Card, EmptyState, IconButton, Label, PageHeader, Screen, SearchField } from '../../../src/components/ui'
import { ProgramCard } from '../../../src/components/programs/ProgramCard'
import { useServerInfiniteList } from '../../../src/hooks/useServerInfiniteList'
import { client } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

export default function Programs() {
  const { accent } = useTheme()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search — 250ms sits in the research-backed 200–300ms sweet spot (matches
  // the Workouts list).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const fetcher = useCallback(
    (offset: number, limit: number) =>
      client.programAPI.list({ offset, limit, q: debouncedSearch || undefined }),
    [debouncedSearch]
  )
  const { items: programs, loadMore, hasMore, loading, initialLoading, refreshing, reload } =
    useServerInfiniteList<Program>({ fetcher, deps: [debouncedSearch] })

  // The stack keeps this screen mounted under the detail/form screens; refetch on
  // re-focus so an edit/delete/create there reflects here. Skip the first focus (the
  // hook's deps-effect already fetched).
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true
        return
      }
      reload()
    }, [reload])
  )

  const [pulling, setPulling] = useState(false)
  const onPullRefresh = useCallback(async () => {
    setPulling(true)
    await reload()
    setPulling(false)
  }, [reload])

  // Weight-style loading (no skeleton / center spinner): the screen renders
  // immediately and content is grayed out while a *full* (re)load is in flight —
  // the first fetch or a search/refresh. Pagination (loadMore) is excluded so
  // appending a page doesn't dim the whole list.
  const dim = initialLoading || refreshing

  const stats = [
    // 1:1 with web: summarize the *loaded* items, not a server-side stat.
    { label: 'Total', value: String(programs.length), unit: 'programs' },
    {
      label: 'Avg Exercises',
      value:
        programs.length > 0
          ? String(Math.round(programs.reduce((s, p) => s + (p.exercises?.length || 0), 0) / programs.length))
          : '0',
      unit: 'per program',
    },
  ]

  return (
    <Screen>
      <FlatList
        data={programs}
        keyExtractor={(p) => String(p.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={accent} colors={[accent]} />
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="gap-5 py-4">
            <PageHeader
              title="Programs"
              subtitle="Reusable workout templates"
              action={
                <IconButton
                  icon={Plus}
                  label="New Program"
                  variant="solid"
                  size="md"
                  onPress={() => router.push('/programs/new')}
                />
              }
            />

            {/* Summary — web's 2-card grid, grayed out during a full (re)load. */}
            <View className="flex-row gap-3" style={{ opacity: dim ? 0.5 : 1 }}>
              {stats.map((s) => (
                <Card key={s.label} className="flex-1 rounded-2xl">
                  <Label className="mb-2" numberOfLines={1}>{s.label}</Label>
                  <View className="flex-row items-end gap-1">
                    <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{s.value}</AppText>
                    <AppText variant="caption" color="muted" className="mb-0.5" numberOfLines={1}>{s.unit}</AppText>
                  </View>
                </Card>
              ))}
            </View>

            <SearchField
              value={search}
              onChangeText={setSearch}
              loading={refreshing}
              placeholder="Search programs…"
            />
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ opacity: dim ? 0.5 : 1 }}>
            <ProgramCard
              program={item}
              onPress={() => router.push(`/programs/${item.id}`)}
              onDeleted={() => reload()}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={BookOpen}
              title="No programs found"
              subtitle={search ? 'Try a different search' : 'Create a program to get started'}
            />
          )
        }
        ListFooterComponent={
          // Pagination-only spinner: `!dim` keeps it from firing during a full
          // (re)load — there the content is already grayed, so a footer spinner
          // would read as an unwanted "loading" in the middle.
          hasMore && loading && !dim && programs.length > 0 ? (
            <View className="items-center py-3">
              <ActivityIndicator size="small" color={accent} />
            </View>
          ) : null
        }
      />
    </Screen>
  )
}
