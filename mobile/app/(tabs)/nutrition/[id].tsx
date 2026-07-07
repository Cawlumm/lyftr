import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { format, parseISO } from 'date-fns'
import { AlertCircle, ArrowLeft, Edit2, Flame, Trash2 } from 'lucide-react-native'
import type { FoodLog } from '@lyftr/shared'
import {
  AppText, Card, ConfirmSheet, Loading, Screen, deleteConfirmProps,
} from '../../../src/components/ui'
import {
  MACRO_COLORS, MACRO_TEXT, MEAL_COLORS, MEAL_ICONS, MEAL_LABELS, type Meal,
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

  const meal = entry.meal as Meal
  const MealIcon = MEAL_ICONS[meal]
  const mealColor = MEAL_COLORS[meal]
  const macros = [
    { label: 'Protein', value: entry.protein, color: MACRO_TEXT.protein, bar: MACRO_COLORS.protein, bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)' },
    { label: 'Carbs', value: entry.carbs, color: MACRO_TEXT.carbs, bar: MACRO_COLORS.carbs, bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
    { label: 'Fat', value: entry.fat, color: MACRO_TEXT.fat, bar: MACRO_COLORS.fat, bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.20)' },
    { label: 'Fiber', value: entry.fiber ?? 0, color: colors.txSecondary, bar: colors.txMuted, bg: colors.muted, border: colors.border },
  ]

  // Calorie contribution per macro (4/4/9 kcal per g) → the composition bar + % split.
  const cals = { protein: entry.protein * 4, carbs: entry.carbs * 4, fat: entry.fat * 9 }
  const macroCal = cals.protein + cals.carbs + cals.fat
  const pctCal = (v: number) => (macroCal > 0 ? Math.round((v / macroCal) * 100) : 0)
  const servingText = entry.serving_size
    ? `${entry.servings} × ${entry.serving_size}`
    : `${entry.servings} serving${entry.servings === 1 ? '' : 's'}`

  // Spec-list rows (MFP / Lose It convention): serving size, servings, meal, logged.
  const specRows: { label: string; value: string; tabular?: boolean }[] = [
    ...(entry.serving_size ? [{ label: 'Serving size', value: entry.serving_size }] : []),
    { label: 'Servings', value: String(entry.servings), tabular: true },
    { label: 'Meal', value: MEAL_LABELS[meal] },
    { label: 'Logged', value: format(parseISO(entry.logged_at), 'EEE, MMM d, yyyy') },
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
              <Image source={{ uri: entry.image_url }} className="h-44 w-full" resizeMode="cover" />
            ) : null}
            <View className="p-5">
              {/* Meal chip */}
              <View className="flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1" style={{ backgroundColor: `${mealColor}1A`, borderColor: `${mealColor}40` }}>
                <MealIcon size={13} color={mealColor} />
                <AppText variant="caption" style={{ color: mealColor, fontWeight: '700' }}>{MEAL_LABELS[meal]}</AppText>
              </View>

              {/* Name + calorie hero */}
              <AppText variant="title" className="mt-3" numberOfLines={2}>{entry.name}</AppText>
              <View className="mt-1 flex-row items-center gap-1.5">
                <Flame size={20} color={MACRO_COLORS.carbs} />
                <AppText variant="display" style={{ fontSize: 38, lineHeight: 42, fontVariant: ['tabular-nums'] }}>{Math.round(entry.calories)}</AppText>
                <AppText variant="body" color="muted" className="mb-1">kcal</AppText>
              </View>

              {/* Macro composition bar (by calories) */}
              {macroCal > 0 ? (
                <View className="mt-5">
                  <View className="h-3 flex-row overflow-hidden rounded-full bg-surface-muted">
                    <View style={{ width: `${pctCal(cals.protein)}%`, backgroundColor: MACRO_COLORS.protein }} />
                    <View style={{ width: `${pctCal(cals.carbs)}%`, backgroundColor: MACRO_COLORS.carbs }} />
                    <View style={{ width: `${pctCal(cals.fat)}%`, backgroundColor: MACRO_COLORS.fat }} />
                  </View>
                  <View className="mt-2.5 flex-row justify-between">
                    {([['Protein', cals.protein, MACRO_COLORS.protein], ['Carbs', cals.carbs, MACRO_COLORS.carbs], ['Fat', cals.fat, MACRO_COLORS.fat]] as const).map(([label, v, color]) => (
                      <View key={label} className="flex-row items-center gap-1.5">
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                        <AppText variant="caption" color="muted">{label}</AppText>
                        <AppText variant="caption" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pctCal(v)}%</AppText>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Macro grid (grams) */}
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

          {/* Details — spec list (label → value), the convention in MFP / Lose It. */}
          <Card className="overflow-hidden p-0">
            {specRows.map((r, i) => (
              <View key={r.label} className={`flex-row items-center justify-between gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-surface-border' : ''}`}>
                <AppText variant="body" color="muted">{r.label}</AppText>
                <AppText variant="bodySemibold" numberOfLines={1} style={r.tabular ? { fontVariant: ['tabular-nums'] } : undefined}>{r.value}</AppText>
              </View>
            ))}
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
