import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { Card, PageHeader, Screen, Skeleton, SkeletonList, SkeletonStatRow } from '../ui'

// Initial-load skeleton for the Weight page — content-shaped placeholders laid out
// 1:1 with the real screen (log card · current-weight hero · Avg/Low/High stats ·
// trend chart · history rows) so the data fills into its own shape instead of popping
// after a blank spinner. The PageHeader is the real, live title. Mirrors the pattern
// of WorkoutsSkeleton / ProgramsSkeleton.
// wide: the screen's wide web layout (figures and trend left, log and history right; from
// xl the hero and the tiles share a row).
export function WeightSkeleton({ wide = false }: { wide?: boolean }) {
  const { t } = useTranslation()
  const { xl } = useBreakpoint()
  const header = (
    <PageHeader
      title={t('weight.title')}
      subtitle={t('weight.subtitle')}
      action={<Skeleton width={44} height={24} radius={999} />}
    />
  )

  // Log card: title row · stepper input · add date/note · button
  const logCard = (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Skeleton width={110} height={18} />
        <Skeleton width={70} height={12} />
      </View>
      <Skeleton height={86} radius={12} />
      <Skeleton height={44} radius={12} />
      <Skeleton height={48} radius={8} />
    </Card>
  )

  // Current-weight hero
  const hero = (
    <Card>
      <Skeleton width={110} height={12} />
      <View className="mt-2">
        <Skeleton width={130} height={40} radius={8} />
      </View>
    </Card>
  )

  // Trend chart: title + period pill + plot
  const chart = (
    <Card>
      <View className="mb-3 flex-row items-center justify-between">
        <Skeleton width={60} height={16} />
        <Skeleton width={132} height={28} radius={12} />
      </View>
      <Skeleton height={wide ? 280 : 180} radius={12} />
    </Card>
  )

  if (wide) {
    return (
      <Screen maxWidth="wide">
        <View className="gap-6 py-4">
          {header}
          <View className="flex-row items-start gap-6">
            <View className="min-w-0 flex-1 gap-5">
              {xl ? (
                <View className="flex-row gap-3">
                  <View style={{ flex: 2 }}>{hero}</View>
                  <View style={{ flex: 3 }}><SkeletonStatRow count={3} /></View>
                </View>
              ) : (
                <>
                  {hero}
                  <SkeletonStatRow count={3} />
                </>
              )}
              {chart}
            </View>
            <View style={{ width: 360 }} className="gap-5">
              {logCard}
              <View className="gap-4">
                <Skeleton width={72} height={14} />
                <SkeletonList count={4} />
              </View>
            </View>
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <View className="gap-5 py-4">
        {header}
        {logCard}
        {hero}

        {/* Avg / Low / High */}
        <SkeletonStatRow count={3} />

        {chart}

        {/* History heading */}
        <Skeleton width={72} height={14} />
      </View>

      {/* History rows */}
      <SkeletonList count={4} />
    </Screen>
  )
}
