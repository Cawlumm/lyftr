import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import {
  ArrowLeft, Search, Scan, Minus, Plus, X,
  Bookmark, BookmarkCheck, AlertCircle, Utensils, Zap,
  Coffee, Sun, Moon, Cookie, ChevronRight, CalendarDays,
} from 'lucide-react'
import { foodAPI, savedFoodsAPI } from '../services/api'
import { todayStr, dayToIsoNoon } from '../utils/dateUtils'
import BarcodeScanner from '../components/BarcodeScanner'
import IconButton from '../components/ui/IconButton'
import SegmentedControl from '../components/ui/SegmentedControl'
import * as types from '../types'

type Phase = 'search' | 'detail' | 'scan'
type SearchTab = 'recent' | 'myfoods' | 'all'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
}
const MEAL_ICONS: Record<string, React.ElementType> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snacks: Cookie,
}
const MEAL_COLORS: Record<string, string> = {
  breakfast: 'text-amber-400', lunch: 'text-yellow-400',
  dinner: 'text-indigo-400', snacks: 'text-pink-400',
}

function entryToResult(e: types.FoodLog): types.FoodSearchResult {
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

function savedToResult(s: types.SavedFood): types.FoodSearchResult {
  return {
    name: s.name, brand: s.brand,
    calories: s.calories, protein: s.protein, carbs: s.carbs,
    fat: s.fat, fiber: s.fiber, serving_size: s.serving_size, source: 'saved',
  }
}

function FoodResultRow({ item, onClick }: { item: types.FoodSearchResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-surface-muted active:bg-surface-muted/80 transition-colors border-b border-surface-border last:border-0 text-left"
    >
      {item.image_url ? (
        <img src={item.image_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-surface-border" />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
          <Utensils className="w-5 h-5 text-tx-muted" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-tx-primary truncate">{item.name}</p>
        {item.brand && <p className="text-xs text-tx-muted truncate mt-0.5">{item.brand}</p>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs font-semibold text-tx-secondary tabular-nums">{Math.round(item.calories)} kcal</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-emerald-400 tabular-nums">{item.protein.toFixed(0)}g P</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-amber-400 tabular-nums">{item.carbs.toFixed(0)}g C</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-violet-400 tabular-nums">{item.fat.toFixed(0)}g F</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
    </button>
  )
}

export default function LogFood() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const editId = searchParams.get('edit') ? Number(searchParams.get('edit')) : null
  const initMeal = (searchParams.get('meal') ?? 'breakfast') as types.FoodLog['meal']
  const initDate = searchParams.get('date') ?? todayStr()

  const [phase, setPhase] = useState<Phase>('search')
  const [tab, setTab] = useState<SearchTab>('recent')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<types.FoodSearchResult[]>([])
  const [recentItems, setRecentItems] = useState<types.FoodSearchResult[]>([])
  const [savedFoods, setSavedFoods] = useState<types.SavedFood[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)

  const [selected, setSelected] = useState<types.FoodSearchResult | null>(null)
  const [servings, setServings] = useState(1)
  const [meal, setMeal] = useState<types.FoodLog['meal']>(initMeal)
  const [date, setDate] = useState(initDate)
  const [saveToMyFoods, setSaveToMyFoods] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editId) return
    foodAPI.get(editId).then(entry => {
      setSelected(entryToResult(entry))
      setServings(entry.servings || 1)
      setMeal(entry.meal)
      setDate(entry.logged_at.slice(0, 10))
      setPhase('detail')
    }).catch(() => navigate('/food', { replace: true }))
  }, [editId])

  useEffect(() => {
    foodAPI.list(todayStr()).then(logs => {
      const seen = new Set<string>()
      const items: types.FoodSearchResult[] = []
      for (const log of (logs || [])) {
        const key = log.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          items.push(entryToResult(log))
          if (items.length >= 10) break
        }
      }
      setRecentItems(items)
    }).catch(() => {})
    savedFoodsAPI.list().then(setSavedFoods).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'all') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      setRateLimited(false)
      try {
        setSearchResults(await foodAPI.search(query.trim()) ?? [])
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

  const selectResult = (result: types.FoodSearchResult) => {
    setSelected(result)
    setServings(1)
    setPhase('detail')
  }

  const handleBarcodeResult = async (code: string) => {
    setPhase('search')
    try {
      selectResult(await foodAPI.barcode(code))
    } catch (err: any) {
      if (err?.response?.status === 404) {
        selectResult({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })
      } else {
        setSearchError('Product not found — enter details manually')
      }
    }
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
        await foodAPI.update(editId, payload)
      } else {
        await foodAPI.log(payload)
        if (saveToMyFoods) {
          savedFoodsAPI.create({
            name: selected.name, brand: selected.brand ?? '',
            calories: selected.calories, protein: selected.protein,
            carbs: selected.carbs, fat: selected.fat, fiber: selected.fiber ?? 0,
            serving_size: selected.serving_size ?? '',
          }).catch(() => {})
        }
      }
      navigate('/food', { replace: true })
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  if (phase === 'scan') {
    return (
      <BarcodeScanner
        onResult={handleBarcodeResult}
        onClose={() => setPhase('search')}
      />
    )
  }

  const cal = selected ? Math.round(selected.calories * servings) : 0
  const pro = selected ? +(selected.protein * servings).toFixed(1) : 0
  const carb = selected ? +(selected.carbs * servings).toFixed(1) : 0
  const fat_ = selected ? +(selected.fat * servings).toFixed(1) : 0
  const fib = selected ? +((selected.fiber ?? 0) * servings).toFixed(1) : 0
  const quickAddCals = /^\d+(\.\d+)?$/.test(query.trim()) ? Number(query.trim()) : null

  return (
    <div className="animate-slide-up flex flex-col min-h-0">
      {/* Header with breadcrumb */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => phase === 'detail' && !editId ? setPhase('search') : navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-muted active:scale-95 transition-all flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div className="flex-1 min-w-0">
          {phase === 'detail' && selected ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-tx-muted mb-0.5">
                <span>{editId ? 'Edit Food' : 'Log Food'}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-tx-secondary">Details</span>
              </div>
              <h1 className="font-display font-bold text-xl text-tx-primary truncate">
                {selected.name || 'New Entry'}
              </h1>
              {selected.brand && <p className="text-xs text-tx-muted mt-0.5">{selected.brand}</p>}
            </>
          ) : (
            <h1 className="font-display font-bold text-2xl text-tx-primary">Log Food</h1>
          )}
        </div>
      </div>

      {/* Search phase */}
      {phase === 'search' && (
        <div className="space-y-4">
          {/* Search input + scan button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-tx-muted pointer-events-none" />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); if (e.target.value.trim()) setTab('all') }}
                placeholder="Search food…"
                className="input pl-10 pr-10 w-full h-12 text-base"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); searchInputRef.current?.focus() }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-surface-muted flex items-center justify-center hover:bg-surface-overlay transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-tx-muted" />
                </button>
              )}
            </div>
            <button
              onClick={() => setPhase('scan')}
              className="flex items-center gap-1.5 px-3.5 h-12 rounded-xl bg-surface-muted hover:bg-surface-overlay border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors flex-shrink-0"
              aria-label="Scan barcode"
            >
              <Scan className="w-5 h-5" />
              <span className="text-xs font-medium">Scan</span>
            </button>
          </div>

          {/* Tabs */}
          <SegmentedControl
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'myfoods', label: 'My Foods' },
              { value: 'all', label: 'Search' },
            ] as const}
            value={tab}
            onChange={setTab}
          />

          {rateLimited && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Too many requests — wait a moment and try again
            </div>
          )}
          {searchError && (
            <div className="flex items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-3.5 py-3 text-xs text-error-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {searchError}
            </div>
          )}

          {/* Results */}
          <div className="card overflow-hidden">
            {tab === 'all' && quickAddCals !== null && (
              <button
                onClick={() => selectResult({ name: `${quickAddCals} kcal`, calories: quickAddCals, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })}
                className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-surface-muted transition-colors border-b border-surface-border"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-tx-primary">Quick add {quickAddCals} kcal</p>
                  <p className="text-xs text-tx-muted mt-0.5">No macro breakdown</p>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
              </button>
            )}

            {tab === 'recent' && (
              recentItems.length === 0
                ? (
                  <div className="px-4 py-14 text-center">
                    <Utensils className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                    <p className="text-sm text-tx-muted">No recent items today</p>
                    <p className="text-xs text-tx-muted mt-1 opacity-60">Search or scan to log food</p>
                  </div>
                )
                : recentItems.map((item, i) => <FoodResultRow key={i} item={item} onClick={() => selectResult(item)} />)
            )}

            {tab === 'myfoods' && (
              savedFoods.length === 0
                ? (
                  <div className="px-4 py-14 text-center">
                    <Bookmark className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                    <p className="text-sm text-tx-muted">No saved foods yet</p>
                    <p className="text-xs text-tx-muted mt-1 opacity-60">Save foods while logging to find them here</p>
                  </div>
                )
                : savedFoods.map(sf => <FoodResultRow key={sf.id} item={savedToResult(sf)} onClick={() => selectResult(savedToResult(sf))} />)
            )}

            {tab === 'all' && !query.trim() && (
              <div className="px-4 py-14 text-center">
                <Search className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                <p className="text-sm text-tx-muted">Search millions of foods</p>
                <p className="text-xs text-tx-muted mt-1 opacity-60">Or scan a barcode</p>
              </div>
            )}
            {tab === 'all' && query.trim() && searching && (
              <div className="px-4 py-14 text-center text-sm text-tx-muted">Searching…</div>
            )}
            {tab === 'all' && query.trim() && !searching && searchResults.length === 0 && !searchError && !rateLimited && (
              <div className="px-4 py-14 text-center space-y-3">
                <p className="text-sm text-tx-muted">No results for "{query}"</p>
                <button
                  onClick={() => selectResult({ name: query.trim(), calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })}
                  className="btn-secondary text-xs"
                >
                  + Enter "{query.trim()}" manually
                </button>
              </div>
            )}
            {tab === 'all' && !searching && searchResults.map((item, i) => (
              <FoodResultRow key={i} item={item} onClick={() => selectResult(item)} />
            ))}
          </div>
        </div>
      )}

      {/* Detail phase */}
      {phase === 'detail' && selected && (
        <div className="space-y-4 pb-32">
          {saveError && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Food hero + macros */}
          <div className="card overflow-hidden">
            {/* Image or placeholder */}
            {selected.image_url ? (
              <img
                src={selected.image_url}
                alt={selected.name}
                className="w-full h-52 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-32 bg-surface-muted border-b border-surface-border flex items-center justify-center">
                <Utensils className="w-10 h-10 text-tx-muted opacity-20" />
              </div>
            )}

            <div className="p-5">
              {/* Calorie hero */}
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tabular-nums text-tx-primary leading-none">{cal}</span>
                    <span className="text-sm text-tx-muted">kcal</span>
                  </div>
                  {selected.serving_size && (
                    <p className="text-xs text-tx-muted mt-1">
                      per {servings === 1 ? '' : `${servings} × `}{selected.serving_size}
                    </p>
                  )}
                </div>
                {/* Macro composition mini-bars */}
                {(pro + carb + fat_) > 0 && (
                  <div className="flex flex-col gap-1 items-end w-20 flex-shrink-0">
                    {[
                      { label: 'P', value: pro, color: '#10b981' },
                      { label: 'C', value: carb, color: '#f59e0b' },
                      { label: 'F', value: fat_, color: '#8b5cf6' },
                    ].map(m => {
                      const total = pro + carb + fat_
                      const pct = total > 0 ? Math.round((m.value / total) * 100) : 0
                      return (
                        <div key={m.label} className="flex items-center gap-1.5 w-full">
                          <span className="text-[10px] text-tx-muted w-3 text-right flex-shrink-0">{m.label}</span>
                          <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.color }} />
                          </div>
                          <span className="text-[10px] tabular-nums w-6 text-right flex-shrink-0" style={{ color: m.color }}>{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Macro grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Protein', value: pro, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  { label: 'Carbs',   value: carb, color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
                  { label: 'Fat',     value: fat_, color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20' },
                  { label: 'Fiber',   value: fib,  color: 'text-tx-secondary', bg: 'bg-surface-muted border-surface-border' },
                ].map(m => (
                  <div key={m.label} className={`rounded-xl border p-2.5 text-center ${m.bg}`}>
                    <p className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}g</p>
                    <p className="text-[10px] text-tx-muted mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Servings */}
          <div className="card p-4 space-y-3">
            <label className="label">Servings</label>
            <div className="flex items-center gap-3">
              <IconButton icon={Minus} variant="secondary" size="lg" label="Decrease servings" onClick={() => setServings(s => Math.max(0.5, +(s - 0.5).toFixed(1)))} />
              <input
                type="number"
                value={servings}
                onChange={e => setServings(Math.max(0.5, Number(e.target.value) || 1))}
                step="0.5" min="0.5"
                className="input text-center flex-1 h-12 text-lg font-semibold tabular-nums"
              />
              <IconButton icon={Plus} variant="secondary" size="lg" label="Increase servings" onClick={() => setServings(s => +(s + 0.5).toFixed(1))} />
            </div>
          </div>

          {/* Log to: meal + when */}
          <div className="card p-4 space-y-5">
            {/* Meal */}
            <div className="space-y-3">
              <label className="label">Meal</label>
              <div className="grid grid-cols-2 gap-2">
                {MEALS.map(m => {
                  const MealIcon = MEAL_ICONS[m]
                  const iconColor = MEAL_COLORS[m]
                  const active = meal === m
                  return (
                    <button
                      key={m}
                      onClick={() => setMeal(m)}
                      className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border font-medium text-sm transition-all ${
                        active
                          ? 'bg-brand-500/10 border-brand-500/40 text-tx-primary'
                          : 'bg-surface-muted border-surface-border text-tx-secondary hover:text-tx-primary hover:bg-surface-overlay'
                      }`}
                    >
                      <MealIcon className={`w-4 h-4 flex-shrink-0 ${active ? iconColor : 'text-tx-muted'}`} />
                      {MEAL_LABELS[m]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-surface-border" />

            {/* When */}
            {(() => {
              const today = todayStr()
              const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
              const isToday = date === today
              const isYesterday = date === yesterday
              const isCustom = !isToday && !isYesterday
              const activeCls = 'bg-brand-500/10 border-brand-500/40 text-tx-primary'
              const idleCls = 'bg-surface-muted border-surface-border text-tx-secondary hover:text-tx-primary hover:bg-surface-overlay'
              return (
                <div className="space-y-3">
                  <label className="label">When</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDate(today)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${isToday ? activeCls : idleCls}`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setDate(yesterday)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${isYesterday ? activeCls : idleCls}`}
                    >
                      Yesterday
                    </button>
                    <div className="relative flex-1">
                      <div className={`w-full py-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 pointer-events-none ${isCustom ? activeCls : idleCls}`}>
                        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                        {isCustom ? format(new Date(date + 'T12:00:00'), 'MMM d') : 'Other'}
                      </div>
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        max={today}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Save to My Foods toggle — hidden in edit mode */}
          {!editId && <button
            type="button"
            onClick={() => setSaveToMyFoods(v => !v)}
            className="flex items-center gap-3 w-full card p-4 hover:bg-surface-muted/50 transition-colors"
          >
            <div className={`relative w-11 h-6 rounded-full border transition-colors flex-shrink-0 ${saveToMyFoods ? 'bg-brand-500 border-brand-500' : 'bg-surface-muted border-surface-border'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${saveToMyFoods ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <div className="flex items-center gap-2 flex-1">
              {saveToMyFoods
                ? <BookmarkCheck className="w-4 h-4 text-brand-500" />
                : <Bookmark className="w-4 h-4 text-tx-muted" />
              }
              <span className="text-sm font-medium text-tx-secondary">Save to My Foods</span>
            </div>
          </button>}
        </div>
      )}

      {/* Sticky log button — detail phase only */}
      {phase === 'detail' && selected && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-surface-base/95 backdrop-blur-sm border-t border-surface-border safe-area-bottom">
          <button
            onClick={handleLog}
            disabled={saving}
            className="btn-primary btn-lg w-full"
          >
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Food'}
          </button>
        </div>
      )}
    </div>
  )
}
