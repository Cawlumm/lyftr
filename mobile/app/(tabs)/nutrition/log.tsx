import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  AlertCircle, ArrowLeft, Bookmark, BookmarkCheck, ChevronRight, Minus, Plus, Scan, Utensils, Zap,
} from 'lucide-react-native'
import {
  dayToIsoNoon, todayStr,
  type FoodLog, type FoodSearchResult, type SavedFood,
} from '@lyftr/shared'
import {
  AppText, Button, Card, DateInput, Field, IconButton, Label, NumberField,
  NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, Screen, SearchField, SegmentedControl, Toggle,
} from '../../../src/components/ui'
import { BarcodeScanner } from '../../../src/components/nutrition/BarcodeScanner'
import {
  MACRO_COLORS, MACRO_TEXT, MEALS, MEAL_COLORS, MEAL_ICONS, MEAL_LABELS, type Meal,
} from '../../../src/components/nutrition/nutritionMeta'
import { client } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

type Phase = 'search' | 'detail' | 'scan'
type SearchTab = 'recent' | 'myfoods' | 'all'

const TAB_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'myfoods', label: 'My Foods' },
  { value: 'all', label: 'Search' },
] as const

// Port of web/pages/LogFood.tsx — the search / detail / scan food-logging flow.
// entryToResult / savedToResult reduce stored entries + saved foods to the per-serving
// FoodSearchResult shape the detail view multiplies by `servings`.
function entryToResult(e: FoodLog): FoodSearchResult {
  const s = e.servings || 1
  return {
    name: e.name,
    calories: e.calories / s,
    protein: e.protein / s,
    carbs: e.carbs / s,
    fat: e.fat / s,
    fiber: (e.fiber ?? 0) / s,
    serving_size: e.serving_size ?? '',
    image_url: e.image_url,
    source: 'saved',
  }
}

function savedToResult(s: SavedFood): FoodSearchResult {
  return {
    name: s.name, brand: s.brand,
    calories: s.calories, protein: s.protein, carbs: s.carbs,
    fat: s.fat, fiber: s.fiber, serving_size: s.serving_size, source: 'saved',
  }
}

function FoodResultRow({ item, onPress }: { item: FoodSearchResult; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center gap-3 border-b border-surface-border px-4 py-3.5 active:bg-surface-muted"
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} className="h-11 w-11 rounded-xl border border-surface-border" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
          <Utensils size={20} color={colors.txMuted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <AppText variant="bodySemibold" numberOfLines={1}>{item.name}</AppText>
        {item.brand ? <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">{item.brand}</AppText> : null}
        <View className="mt-1 flex-row flex-wrap items-center gap-x-1.5">
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(item.calories)} kcal</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.protein, fontVariant: ['tabular-nums'] }}>{item.protein.toFixed(0)}g P</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.carbs, fontVariant: ['tabular-nums'] }}>{item.carbs.toFixed(0)}g C</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.fat, fontVariant: ['tabular-nums'] }}>{item.fat.toFixed(0)}g F</AppText>
          {item.serving_size ? (<><Dot /><AppText variant="caption" color="muted" style={{ fontSize: 10 }}>{item.serving_size}</AppText></>) : null}
        </View>
      </View>
      <ChevronRight size={16} color={colors.txMuted} />
    </Pressable>
  )
}

function Dot() {
  return <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>·</AppText>
}

export default function LogFood() {
  const { colors, brand, accent, isDark } = useTheme()
  const params = useLocalSearchParams<{ meal?: string; date?: string; edit?: string }>()
  const editId = params.edit ? Number(params.edit) : null
  const initMeal = (params.meal ?? 'breakfast') as Meal
  const initDate = params.date ?? todayStr()

  const [phase, setPhase] = useState<Phase>('search')
  const [tab, setTab] = useState<SearchTab>('recent')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([])
  const [recentItems, setRecentItems] = useState<FoodSearchResult[]>([])
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)

  const [selected, setSelected] = useState<FoodSearchResult | null>(null)
  const [servingsStr, setServingsStr] = useState('1')
  const [meal, setMeal] = useState<Meal>(initMeal)
  const [date, setDate] = useState(initDate)
  const [saveToMyFoods, setSaveToMyFoods] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Web keeps servings as a clamped number; here the field is a string buffer, so derive
  // the numeric value (same Math.max(0.5, …||1) clamp web applies on change).
  const servings = Math.max(0.5, Number(servingsStr) || 1)

  // Edit mode: load the entry, reduce to per-serving, jump to detail.
  useEffect(() => {
    if (!editId) return
    client.foodAPI.get(editId).then((entry) => {
      setSelected(entryToResult(entry))
      setServingsStr(String(entry.servings || 1))
      setMeal(entry.meal)
      setDate(entry.logged_at.slice(0, 10))
      setPhase('detail')
    }).catch(() => router.replace('/nutrition'))
  }, [editId])

  // Recent (today, deduped ≤10) + saved foods.
  useEffect(() => {
    client.foodAPI.list(todayStr()).then((logs) => {
      const seen = new Set<string>()
      const items: FoodSearchResult[] = []
      for (const log of logs || []) {
        const key = log.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          items.push(entryToResult(log))
          if (items.length >= 10) break
        }
      }
      setRecentItems(items)
    }).catch(() => {})
    client.savedFoodsAPI.list().then(setSavedFoods).catch(() => {})
  }, [])

  // Debounced remote search (only on the Search tab).
  useEffect(() => {
    if (tab !== 'all') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      setRateLimited(false)
      try {
        setSearchResults((await client.foodAPI.search(query.trim())) ?? [])
      } catch (err: any) {
        if (err?.response?.status === 429) setRateLimited(true)
        else setSearchError('Food search unavailable — enter details manually')
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, tab])

  const selectResult = (result: FoodSearchResult) => {
    setSelected(result)
    setServingsStr('1')
    setPhase('detail')
  }

  const handleBarcodeResult = async (code: string) => {
    setPhase('search')
    try {
      selectResult(await client.foodAPI.barcode(code))
    } catch (err: any) {
      if (err?.response?.status === 404) {
        selectResult({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'manual' })
      } else {
        setSearchError('Product not found — enter details manually')
      }
    }
  }

  const stepServings = (delta: number) => {
    const next = delta < 0 ? Math.max(0.5, +(servings - 0.5).toFixed(1)) : +(servings + 0.5).toFixed(1)
    setServingsStr(String(next))
  }

  const handleLog = async () => {
    if (!selected || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: selected.name || 'Custom entry',
        meal,
        calories: +(selected.calories * servings).toFixed(1),
        protein: +(selected.protein * servings).toFixed(1),
        carbs: +(selected.carbs * servings).toFixed(1),
        fat: +(selected.fat * servings).toFixed(1),
        fiber: +((selected.fiber ?? 0) * servings).toFixed(1),
        servings,
        serving_size: selected.serving_size ?? '',
        image_url: selected.image_url ?? '',
        logged_at: dayToIsoNoon(date),
      }
      if (editId) {
        await client.foodAPI.update(editId, payload)
      } else {
        await client.foodAPI.log(payload)
        if (saveToMyFoods) {
          await client.savedFoodsAPI.create({
            name: selected.name, brand: selected.brand ?? '',
            calories: selected.calories, protein: selected.protein,
            carbs: selected.carbs, fat: selected.fat, fiber: selected.fiber ?? 0,
            serving_size: selected.serving_size ?? '',
          }).catch(() => {})
        }
      }
      router.replace('/nutrition')
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  const goBack = () => {
    if (phase === 'detail' && !editId) { setPhase('search'); return }
    if (router.canGoBack()) router.back()
    else router.replace('/nutrition')
  }

  if (phase === 'scan') {
    return <BarcodeScanner onResult={handleBarcodeResult} onClose={() => setPhase('search')} />
  }

  const cal = selected ? Math.round(selected.calories * servings) : 0
  const pro = selected ? +(selected.protein * servings).toFixed(1) : 0
  const carb = selected ? +(selected.carbs * servings).toFixed(1) : 0
  const fat_ = selected ? +(selected.fat * servings).toFixed(1) : 0
  const fib = selected ? +((selected.fiber ?? 0) * servings).toFixed(1) : 0
  const quickAddCals = /^\d+(\.\d+)?$/.test(query.trim()) ? Number(query.trim()) : null

  return (
    <Screen>
      {/* Header */}
      <View className="flex-row items-center gap-3 py-4">
        <Pressable onPress={goBack} className="h-10 w-10 items-center justify-center rounded-xl active:scale-95" accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.txMuted} />
        </Pressable>
        <View className="min-w-0 flex-1">
          {phase === 'detail' && selected ? (
            <>
              <View className="flex-row items-center gap-1.5">
                <AppText variant="caption" color="muted">{editId ? 'Edit Food' : 'Log Food'}</AppText>
                <ChevronRight size={12} color={colors.txMuted} />
                <AppText variant="caption" color="secondary">Details</AppText>
              </View>
              <AppText variant="title" numberOfLines={1}>{selected.name || 'New Entry'}</AppText>
              {selected.brand ? <AppText variant="caption" color="muted">{selected.brand}</AppText> : null}
            </>
          ) : (
            <AppText variant="title">Log Food</AppText>
          )}
        </View>
      </View>

      {/* ── Search phase ── */}
      {phase === 'search' ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="gap-4">
            {/* Search + scan */}
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <SearchField
                  autoFocus
                  loading={tab === 'all' && searching}
                  placeholder="Search food…"
                  value={query}
                  onChangeText={(t) => { setQuery(t); if (t.trim()) setTab('all') }}
                />
              </View>
              <Pressable
                onPress={() => setPhase('scan')}
                accessibilityLabel="Scan barcode"
                className="h-12 flex-row items-center gap-1.5 rounded-xl border border-surface-border bg-surface-muted px-3.5 active:opacity-70"
              >
                <Scan size={20} color={colors.txSecondary} />
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>Scan</AppText>
              </Pressable>
            </View>

            {/* Tabs */}
            <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />

            {rateLimited ? (
              <View className="flex-row items-center gap-2 rounded-xl border border-warning-500/20 bg-warning-500/10 px-3.5 py-3">
                <AlertCircle size={16} color={isDark ? brand.warningSoft : brand.warning} />
                <AppText variant="caption" style={{ color: isDark ? brand.warningSoft : brand.warning }}>Too many requests — wait a moment and try again</AppText>
              </View>
            ) : null}
            {searchError ? (
              <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-3.5 py-3">
                <AlertCircle size={16} color={isDark ? brand.errorSoft : brand.error} />
                <AppText variant="caption" color="error">{searchError}</AppText>
              </View>
            ) : null}

            {/* Results */}
            <Card className="overflow-hidden p-0">
              {tab === 'all' && quickAddCals !== null ? (
                <Pressable
                  onPress={() => selectResult({ name: `${quickAddCals} kcal`, calories: quickAddCals, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })}
                  className="w-full flex-row items-center gap-3 border-b border-surface-border px-4 py-3.5 active:bg-surface-muted"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                    <Zap size={20} color={accent} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText variant="bodySemibold">Quick add {quickAddCals} kcal</AppText>
                    <AppText variant="caption" color="muted" className="mt-0.5">No macro breakdown</AppText>
                  </View>
                  <ChevronRight size={16} color={colors.txMuted} />
                </Pressable>
              ) : null}

              {tab === 'recent' ? (
                recentItems.length === 0 ? (
                  <EmptyBlock icon={Utensils} title="No recent items today" subtitle="Search or scan to log food" />
                ) : (
                  recentItems.map((item) => <FoodResultRow key={`${item.name}-${item.calories}`} item={item} onPress={() => selectResult(item)} />)
                )
              ) : null}

              {tab === 'myfoods' ? (
                savedFoods.length === 0 ? (
                  <EmptyBlock icon={Bookmark} title="No saved foods yet" subtitle="Save foods while logging to find them here" />
                ) : (
                  savedFoods.map((sf) => <FoodResultRow key={sf.id} item={savedToResult(sf)} onPress={() => selectResult(savedToResult(sf))} />)
                )
              ) : null}

              {tab === 'all' && !query.trim() ? (
                <EmptyBlock icon={Utensils} title="Search millions of foods" subtitle="Or scan a barcode" />
              ) : null}
              {tab === 'all' && query.trim() && searching ? (
                <View className="px-4 py-14"><AppText variant="body" color="muted" className="text-center">Searching…</AppText></View>
              ) : null}
              {tab === 'all' && query.trim() && !searching && searchResults.length === 0 && !searchError && !rateLimited ? (
                <View className="items-center gap-3 px-4 py-14">
                  <AppText variant="body" color="muted">No results for "{query}"</AppText>
                  <Pressable
                    onPress={() => selectResult({ name: query.trim(), calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })}
                    className="rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 active:opacity-70"
                  >
                    <AppText variant="caption" color="secondary">＋ Enter "{query.trim()}" manually</AppText>
                  </Pressable>
                </View>
              ) : null}
              {tab === 'all' && !searching ? searchResults.map((item) => (
                <FoodResultRow key={`${item.name}-${item.calories}`} item={item} onPress={() => selectResult(item)} />
              )) : null}
            </Card>
          </View>
        </ScrollView>
      ) : null}

      {/* ── Detail phase ── */}
      {phase === 'detail' && selected ? (
        <>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
            <View className="gap-4">
              {saveError ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
                  <AlertCircle size={18} color={isDark ? brand.errorSoft : brand.error} />
                  <AppText variant="body" color="error" className="flex-1">{saveError}</AppText>
                </View>
              ) : null}

              {/* Food hero + macros */}
              <Card className="overflow-hidden p-0">
                {selected.image_url ? (
                  <Image source={{ uri: selected.image_url }} className="h-52 w-full" resizeMode="cover" />
                ) : (
                  <View className="h-32 w-full items-center justify-center border-b border-surface-border bg-surface-muted">
                    <Utensils size={40} color={colors.txMuted} style={{ opacity: 0.2 }} />
                  </View>
                )}
                <View className="p-5">
                  {/* Calorie hero */}
                  <View className="mb-5 flex-row items-end justify-between">
                    <View>
                      <View className="flex-row items-baseline gap-1.5">
                        <AppText variant="display" style={{ fontSize: 44, lineHeight: 46, fontVariant: ['tabular-nums'] }}>{cal}</AppText>
                        <AppText variant="body" color="muted">kcal</AppText>
                      </View>
                      {selected.serving_size ? (
                        <AppText variant="caption" color="muted" className="mt-1">per {servings === 1 ? '' : `${servings} × `}{selected.serving_size}</AppText>
                      ) : null}
                    </View>
                    {pro + carb + fat_ > 0 ? (
                      <View className="w-24 flex-col items-end gap-1">
                        {[
                          { label: 'P', value: pro, color: MACRO_COLORS.protein },
                          { label: 'C', value: carb, color: MACRO_COLORS.carbs },
                          { label: 'F', value: fat_, color: MACRO_COLORS.fat },
                        ].map((m) => {
                          const total = pro + carb + fat_
                          const pct = total > 0 ? Math.round((m.value / total) * 100) : 0
                          return (
                            <View key={m.label} className="w-full flex-row items-center gap-1.5">
                              <AppText variant="caption" color="muted" style={{ fontSize: 10, width: 10, textAlign: 'right' }}>{m.label}</AppText>
                              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                                {/* inline height:'100%' — the h-full class expands on native (see index.tsx) */}
                                <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: m.color }} />
                              </View>
                              <AppText variant="caption" style={{ fontSize: 10, width: 24, textAlign: 'right', color: m.color, fontVariant: ['tabular-nums'] }}>{pct}%</AppText>
                            </View>
                          )
                        })}
                      </View>
                    ) : null}
                  </View>

                  {/* Macro grid */}
                  <View className="flex-row gap-2">
                    {[
                      { label: 'Protein', value: pro, color: MACRO_TEXT.protein, bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)' },
                      { label: 'Carbs', value: carb, color: MACRO_TEXT.carbs, bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
                      { label: 'Fat', value: fat_, color: MACRO_TEXT.fat, bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.20)' },
                      { label: 'Fiber', value: fib, color: colors.txSecondary, bg: colors.muted, border: colors.border },
                    ].map((m) => (
                      <View key={m.label} className="flex-1 items-center rounded-xl border p-2.5" style={{ backgroundColor: m.bg, borderColor: m.border }}>
                        <AppText variant="bodySemibold" style={{ color: m.color, fontVariant: ['tabular-nums'] }}>{m.value}g</AppText>
                        <AppText variant="caption" color="muted" style={{ fontSize: 10 }} className="mt-0.5">{m.label}</AppText>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>

              {/* Servings */}
              <Card className="gap-3">
                <View className="flex-row items-baseline gap-2">
                  <Label>Servings</Label>
                  {selected.serving_size ? <AppText variant="caption" color="muted">({selected.serving_size} each)</AppText> : null}
                </View>
                <View className="flex-row items-center gap-3">
                  <IconButton icon={Minus} variant="secondary" size="lg" label="Decrease servings" onPress={() => stepServings(-0.5)} />
                  <View className="flex-1">
                    <NumberField
                      inputMode="decimal"
                      value={servingsStr}
                      onChange={setServingsStr}
                      accessibilityLabel="Servings"
                      inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                    />
                  </View>
                  <IconButton icon={Plus} variant="secondary" size="lg" label="Increase servings" onPress={() => stepServings(0.5)} />
                </View>
              </Card>

              {/* Meal + when */}
              <Card className="gap-5">
                <View className="gap-3">
                  <Label>Meal</Label>
                  <View className="flex-row flex-wrap gap-2">
                    {MEALS.map((m) => {
                      const MealIcon = MEAL_ICONS[m]
                      const active = meal === m
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setMeal(m)}
                          style={{ width: '48%' }}
                          className={`flex-row items-center gap-2.5 rounded-xl border px-3.5 py-3 ${active ? 'border-brand-500/40 bg-brand-500/10' : 'border-surface-border bg-surface-muted'}`}
                        >
                          <MealIcon size={16} color={active ? MEAL_COLORS[m] : colors.txMuted} />
                          <AppText variant="bodySemibold" style={{ fontSize: 13 }} color={active ? 'primary' : 'secondary'}>{MEAL_LABELS[m]}</AppText>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                <View className="h-px bg-surface-border" />

                <DateInput label="When" value={date} onChange={setDate} maximumDate={new Date()} />
              </Card>

              {/* Save to My Foods — hidden in edit mode */}
              {!editId ? (
                <Pressable onPress={() => setSaveToMyFoods((v) => !v)} className="flex-row items-center gap-3">
                  <Card className="flex-1 flex-row items-center gap-3">
                    <View pointerEvents="none">
                      <Toggle value={saveToMyFoods} onValueChange={setSaveToMyFoods} />
                    </View>
                    <View className="flex-row items-center gap-2">
                      {saveToMyFoods ? <BookmarkCheck size={16} color={accent} /> : <Bookmark size={16} color={colors.txMuted} />}
                      <AppText variant="bodySemibold" color="secondary" style={{ fontSize: 14 }}>Save to My Foods</AppText>
                    </View>
                  </Card>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>

          {/* Sticky log button */}
          <View className="border-t border-surface-border bg-surface-base pb-6 pt-3">
            <Button
              title={saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Food'}
              onPress={handleLog}
              loading={saving}
              disabled={saving}
            />
          </View>
          <NumericKeyboardAccessory />
        </>
      ) : null}
    </Screen>
  )
}

function EmptyBlock({ icon: Icon, title, subtitle }: { icon: typeof Utensils; title: string; subtitle: string }) {
  const { colors } = useTheme()
  return (
    <View className="items-center px-4 py-14">
      <Icon size={32} color={colors.txMuted} style={{ opacity: 0.3, marginBottom: 8 }} />
      <AppText variant="body" color="muted">{title}</AppText>
      <AppText variant="caption" color="muted" className="mt-1" style={{ opacity: 0.6 }}>{subtitle}</AppText>
    </View>
  )
}
