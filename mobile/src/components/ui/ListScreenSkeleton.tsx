import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Screen } from './Screen'
import { PageHeader } from './PageHeader'
import { Skeleton, SkeletonList, SkeletonStatRow } from './Skeleton'

interface Props {
  /** Real page title — the header is a live control, not a placeholder. */
  title: string
  subtitle?: string
  /** Real header action (e.g. the New/Log IconButton) — live immediately. */
  action?: ReactNode
  /** Number of summary stat placeholder cards (Workouts = 3, Programs = 2). */
  statCount?: number
  /** Show a search-bar placeholder under the stats. */
  search?: boolean
  /** Placeholder card rows. */
  rows?: number
}

// Generic initial-load skeleton for the app's list screens (Workouts, Programs, …):
// the REAL PageHeader + action render immediately (live controls), and only the
// data-shaped regions — stat row, search bar, card list — are placeholders, laid out
// 1:1 with the real screen so content fills in rather than popping after a blank
// spinner. Per-screen skeletons are thin wrappers that pass their own title/stats.
export function ListScreenSkeleton({ title, subtitle, action, statCount = 3, search = true, rows = 6 }: Props) {
  return (
    <Screen>
      <View className="gap-5 py-4">
        <PageHeader title={title} subtitle={subtitle} action={action} />
        {statCount > 0 ? <SkeletonStatRow count={statCount} /> : null}
        {search ? <Skeleton height={48} radius={8} /> : null}
      </View>
      <SkeletonList count={rows} />
    </Screen>
  )
}
