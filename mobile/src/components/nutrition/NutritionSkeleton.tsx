import { View } from 'react-native'
import { Card, PageHeader, Screen, Skeleton } from '../ui'

// Initial-load skeleton for the Nutrition page — content-shaped placeholders laid out
// 1:1 with the real screen (date nav · calorie hero + rings · four meal cards · macro
// history) so data fills into its own shape instead of popping after a blank spinner.
// Mirrors WeightSkeleton / DashboardSkeleton. The PageHeader is the real, live title.
export function NutritionSkeleton() {
  return (
    <Screen>
      <View className="gap-4 py-4">
        <PageHeader title="Nutrition" subtitle="Macros & meals" action={<Skeleton width={92} height={32} radius={10} />} />

        {/* Date navigator */}
        <View className="flex-row items-center gap-2">
          <Skeleton width={44} height={44} radius={12} />
          <View className="flex-1"><Skeleton height={40} radius={12} /></View>
          <Skeleton width={44} height={44} radius={12} />
        </View>

        {/* Calorie hero + rings */}
        <Card className="gap-5">
          <View className="flex-row items-center justify-between">
            <View className="gap-2">
              <Skeleton width={60} height={12} />
              <Skeleton width={120} height={36} radius={8} />
            </View>
            <Skeleton width={80} height={36} radius={12} />
          </View>
          <Skeleton height={10} radius={999} />
          <View className="flex-row justify-around">
            {[0, 1, 2].map((i) => (
              <View key={i} className="items-center gap-1.5">
                <Skeleton width={72} height={72} radius={999} />
                <Skeleton width={54} height={12} />
              </View>
            ))}
          </View>
        </Card>

        {/* Meal cards */}
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex-row items-center gap-3">
            <Skeleton width={32} height={32} radius={8} />
            <View className="flex-1"><Skeleton width={100} height={16} /></View>
            <Skeleton width={32} height={32} radius={8} />
          </Card>
        ))}

        {/* Macro history */}
        <Card>
          <View className="mb-4 flex-row items-center justify-between">
            <Skeleton width={110} height={16} />
            <Skeleton width={120} height={28} radius={12} />
          </View>
          <Skeleton height={200} radius={12} />
        </Card>
      </View>
    </Screen>
  )
}
