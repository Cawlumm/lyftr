import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { format, parseISO } from 'date-fns'
import { AlertCircle, ArrowLeft, CalendarDays, Edit2, Layers, Trash2, Utensils } from 'lucide-react-native'
import type { FoodLog } from '@lyftr/shared'
import {
  AppText, Card, ConfirmSheet, Label, Loading, Screen, deleteConfirmProps,
} from '../../../src/components/ui'
import {
  MACRO_TEXT, MEAL_COLORS, MEAL_ICONS, MEAL_LABELS, type Meal,
} from '../../../src/components/nutrition/nutritionMeta'
import { client } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Read-only view of a logged food entry, matching the weight/[id] · workouts/[id] idiom:
// back-nav on the left, Edit (pencil) + Delete (trash) icons top-right. Edit hands off to
// the shared log flow in edit mode; Delete routes through the ConfirmSheet. The dashboard
// refetches on focus, so a delete/edit here is reflected when we pop back.
export default function NutritionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors, accent, brand } = useTheme()

  const [entry, setEntry] = useState<FoodLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/nutrition'))

  useEffect(() => {
    client.foodAPI.get(Number(id))
      .then(setEntry)
      .catch(() => setError('Failed to load entry'))
      .finally(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    if (!entry || deleting) return
    setDeleting(true)
    try {
      await client.foodAPI.delete(entry.id)
      goBack() // the dashboard refetches on focus
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (loading) return <Loading />

  if (error || !entry) {
    return (
      <Screen>
        <View className="gap-4 py-4">
          <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-2 self-start active:opacity-60">
            <ArrowLeft size={16} color={colors.txMuted} />
            <AppText variant="body" color="muted">Nutrition</AppText>
          </Pressable>
          <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
            <AlertCircle size={18} color={brand.errorSoft} />
            <Text className="flex-1 font-sans text-sm text-error-400">{error || 'Entry not found'}</Text>
          </View>
        </View>
      </Screen>
    )
  }

  const MealIcon = MEAL_ICONS[entry.meal as Meal]
  const macros = [
    { label: 'Protein', value: entry.protein, color: MACRO_TEXT.protein, bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)' },
    { label: 'Carbs', value: entry.carbs, color: MACRO_TEXT.carbs, bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
    { label: 'Fat', value: entry.fat, color: MACRO_TEXT.fat, bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.20)' },
    { label: 'Fiber', value: entry.fiber ?? 0, color: colors.txSecondary, bg: colors.muted, border: colors.border },
  ]

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-5 py-4">
          {/* Back nav + actions */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">Nutrition</AppText>
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit entry"
                onPress={() => router.push(`/nutrition/log?edit=${entry.id}`)}
                hitSlop={6}
                className="h-9 flex-row items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 active:scale-95"
              >
                <Edit2 size={15} color={accent} strokeWidth={2.2} />
                <AppText variant="label" style={{ color: accent }}>Edit</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete entry"
                onPress={() => setConfirming(true)}
                disabled={deleting}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-lg active:bg-error-500/10 ${deleting ? 'opacity-40' : ''}`}
              >
                <Trash2 size={17} color={colors.txMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {/* Hero card */}
          <Card className="overflow-hidden p-0">
            {entry.image_url ? (
              <Image source={{ uri: entry.image_url }} className="h-52 w-full" resizeMode="cover" />
            ) : (
              <View className="h-32 w-full items-center justify-center border-b border-surface-border bg-surface-muted">
                <Utensils size={40} color={colors.txMuted} style={{ opacity: 0.2 }} />
              </View>
            )}
            <View className="p-5">
              {/* Meal badge */}
              <View className="mb-3 flex-row items-center gap-1.5 self-start rounded-full border border-surface-border bg-surface-muted px-2.5 py-1">
                <MealIcon size={13} color={MEAL_COLORS[entry.meal as Meal]} />
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>{MEAL_LABELS[entry.meal as Meal]}</AppText>
              </View>

              {/* Calorie hero */}
              <View className="flex-row items-baseline gap-1.5">
                <AppText variant="display" style={{ fontSize: 44, lineHeight: 46, fontVariant: ['tabular-nums'] }}>{Math.round(entry.calories)}</AppText>
                <AppText variant="body" color="muted">kcal</AppText>
              </View>
              <AppText variant="heading" className="mt-1">{entry.name}</AppText>

              {/* Macro grid */}
              <View className="mt-4 flex-row gap-2">
                {macros.map((m) => (
                  <View key={m.label} className="flex-1 items-center rounded-xl border p-2.5" style={{ backgroundColor: m.bg, borderColor: m.border }}>
                    <AppText variant="bodySemibold" style={{ color: m.color, fontVariant: ['tabular-nums'] }}>{m.value.toFixed(0)}g</AppText>
                    <AppText variant="caption" color="muted" style={{ fontSize: 10 }} className="mt-0.5">{m.label}</AppText>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          {/* Details */}
          <Card className="gap-3">
            <Label>Details</Label>
            <DetailRow icon={CalendarDays} label="When" value={format(parseISO(entry.logged_at), 'EEEE, MMMM d, yyyy')} colors={colors} />
            <DetailRow
              icon={Layers}
              label="Servings"
              value={`${entry.servings}${entry.serving_size ? ` × ${entry.serving_size}` : ''}`}
              colors={colors}
            />
          </Card>
        </View>
      </ScrollView>

      <ConfirmSheet
        {...deleteConfirmProps({ title: 'Delete entry?', subject: `"${entry.name}"` })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  )
}

function DetailRow({ icon: Icon, label, value, colors }: {
  icon: typeof CalendarDays; label: string; value: string; colors: { txMuted: string }
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
        <Icon size={16} color={colors.txMuted} />
      </View>
      <View className="flex-1">
        <AppText variant="caption" color="muted">{label}</AppText>
        <AppText variant="bodySemibold">{value}</AppText>
      </View>
    </View>
  )
}
