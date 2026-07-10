import { View } from 'react-native'
import { Card, PageHeader, Screen, Skeleton, SkeletonList, SkeletonStatRow } from '../ui'

// Initial-load skeleton for the Weight page — content-shaped placeholders laid out
// 1:1 with the real screen (log card · current-weight hero · Avg/Low/High stats ·
// trend chart · history rows) so the data fills into its own shape instead of popping
// after a blank spinner. The PageHeader is the real, live title. Mirrors the pattern
// of WorkoutsSkeleton / ProgramsSkeleton.
export function WeightSkeleton() {
  return (
    <Screen>
      <View className="gap-5 py-4">
        <PageHeader
          title="Weight"
          subtitle="Track your body weight over time"
          action={<Skeleton width={44} height={24} radius={999} />}
        />

        {/* Log card: title row · stepper input · add date/note · button */}
        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Skeleton width={110} height={18} />
            <Skeleton width={70} height={12} />
          </View>
          <Skeleton height={86} radius={12} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={48} radius={8} />
        </Card>

        {/* Current-weight hero */}
        <Card>
          <Skeleton width={110} height={12} />
          <View className="mt-2">
            <Skeleton width={130} height={40} radius={8} />
          </View>
        </Card>

        {/* Avg / Low / High */}
        <SkeletonStatRow count={3} />

        {/* Trend chart: title + period pill + plot */}
        <Card>
          <View className="mb-3 flex-row items-center justify-between">
            <Skeleton width={60} height={16} />
            <Skeleton width={132} height={28} radius={12} />
          </View>
          <Skeleton height={180} radius={12} />
        </Card>

        {/* History heading */}
        <Skeleton width={72} height={14} />
      </View>

      {/* History rows */}
      <SkeletonList count={4} />
    </Screen>
  )
}
