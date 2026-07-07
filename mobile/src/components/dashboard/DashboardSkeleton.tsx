import { ScrollView, View } from 'react-native'
import { Card, Screen, Skeleton } from '../ui'

// A card section-header placeholder: brand-dot + title line, optional right control.
function CardHeaderSkel({ right }: { right?: boolean }) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Skeleton width={16} height={16} radius={5} />
        <Skeleton width={110} height={15} />
      </View>
      {right ? <Skeleton width={90} height={22} radius={10} /> : null}
    </View>
  )
}

// Initial-load skeleton for the Home/Dashboard — content-shaped placeholders laid out
// like the real screen (greeting + Start · KPI strip · volume trend · consistency ·
// last workout · nutrition · muscle balance · weight) so each section fills into its
// own shape instead of popping after a blank spinner. Mirrors WorkoutsSkeleton etc.
export function DashboardSkeleton() {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-4 py-4">
          {/* Header: date + greeting, Start button */}
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-2">
              <Skeleton width={150} height={11} />
              <Skeleton width={210} height={26} radius={8} />
            </View>
            <Skeleton width={92} height={36} radius={8} />
          </View>

          {/* This Week: big count + day dots */}
          <Card>
            <View className="flex-row items-start justify-between">
              <View className="gap-2">
                <Skeleton width={80} height={11} />
                <Skeleton width={56} height={34} radius={8} />
              </View>
              <Skeleton width={36} height={36} radius={12} />
            </View>
            <View className="mt-4 flex-row items-center justify-between">
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={i} className="items-center gap-1.5">
                  <Skeleton width={10} height={9} radius={4} />
                  <Skeleton width={14} height={14} radius={999} />
                </View>
              ))}
            </View>
          </Card>

          {/* Volume Trend */}
          <Card>
            <CardHeaderSkel right />
            <Skeleton height={130} radius={12} />
          </Card>

          {/* Consistency heatmap */}
          <Card>
            <CardHeaderSkel right />
            <Skeleton height={92} radius={12} />
          </Card>

          {/* Last workout: title + exercise rows */}
          <Card className="gap-3">
            <Skeleton width={180} height={15} />
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} className="flex-row items-center gap-2.5">
                <Skeleton width={44} height={44} radius={12} />
                <View className="flex-1 gap-2">
                  <Skeleton width="60%" height={13} />
                  <Skeleton width={70} height={16} radius={5} />
                </View>
                <Skeleton width={56} height={12} />
              </View>
            ))}
          </Card>

          {/* Muscle Balance: donut + legend rows */}
          <Card>
            <CardHeaderSkel right />
            <View className="items-center gap-4">
              <Skeleton width={168} height={168} radius={999} />
              <View className="w-full gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={14} radius={7} />
                ))}
              </View>
            </View>
          </Card>

          {/* Today's Nutrition: big number + macro bars */}
          <Card className="gap-3">
            <Skeleton width={140} height={15} />
            <Skeleton width={120} height={34} radius={8} />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={14} radius={7} />
            ))}
          </Card>

          {/* Weight card: number + sparkline */}
          <Card className="gap-3">
            <CardHeaderSkel right />
            <View className="flex-row items-center justify-between">
              <Skeleton width={90} height={26} radius={8} />
              <Skeleton width={32} height={32} radius={10} />
            </View>
            <Skeleton height={48} radius={10} />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  )
}
