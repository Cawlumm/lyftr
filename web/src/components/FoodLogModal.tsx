import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Search, Scan, ChevronLeft, Minus, Plus,
  Bookmark, BookmarkCheck, AlertCircle, Utensils, Zap,
} from 'lucide-react'
import { foodAPI, savedFoodsAPI } from '../services/api'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { todayStr, dayToIsoNoon, isoToDayInput } from '../utils/dateUtils'
import BarcodeScanner from './BarcodeScanner'
import * as types from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onLogged: (entry: types.FoodLog) => void
  defaultMeal?: types.FoodLog['meal']
  editEntry?: types.FoodLog
  defaultDate?: string
}

type Phase = 'search' | 'detail' | 'scan'
type SearchTab = 'recent' | 'myfoods' | 'all'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
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
    source: 'saved',
  }
}

function savedToResult(s: types.SavedFood): types.FoodSearchResult {
  return {
    name: s.name,
    brand: s.brand,
    calories: s.calories,
    protein: s.protein,
    carbs: s.carbs,
    fat: s.fat,
    fiber: s.fiber,
    serving_size: s.serving_size,
    source: 'saved',
  }
}

export default function FoodLogModal({
  open, onClose, onLogged, defaultMeal = 'breakfast', editEntry, defaultDate,
}: Props) {
  const [phase, setPhase] = useState<Phase>(editEntry ? 'detail' : 'search')
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
  const [meal, setMeal] = useState<types.FoodLog['meal']>(defaultMeal)
  const [date, setDate] = useState(defaultDate ?? todayStr())
  const [saveToMyFoods, setSaveToMyFoods] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useBodyScrollLock(open)
  useEscapeKey(open, onClose)

  useEffect(() => {
    if (!open) return
    if (editEntry) {
      setPhase('detail')
      setSelected(entryToResult(editEntry))
      setServings(editEntry.servings)
      setMeal(editEntry.meal)
      setDate(isoToDayInput(editEntry.logged_at))
    } else {
      setPhase('search')
      setQuery('')
      setSearchResults([])
      setSearchError(null)
      setRateLimited(false)
      setTab('recent')
    }
    setSaving(false)
    setSaveError(null)
    setSaveToMyFoods(false)
  }, [open, editEntry])

  useEffect(() => {
    if (!open || phase !== 'search') return
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
  }, [open, phase])

  useEffect(() => {
    if (tab !== 'all') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      setRateLimited(false)
      try {
        const results = await foodAPI.search(query.trim())
        setSearchResults(results ?? [])
      } catch (err: any) {
        if (err?.response?.status === 429) {
          setRateLimited(true)
        } else {
          setSearchError('Food search unavailable — enter details manually')
        }
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
      const result = await foodAPI.barcode(code)
      setSelected(result)
      setServings(1)
      setPhase('detail')
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setSelected({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 serving', source: 'off' })
        setServings(1)
        setPhase('detail')
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
        logged_at: dayToIsoNoon(date),
      }
      const entry = editEntry
        ? await foodAPI.update(editEntry.id, payload)
        : await foodAPI.log(payload)

      if (saveToMyFoods && !editEntry) {
        savedFoodsAPI.create({
          name: selected.name,
          brand: selected.brand ?? '',
          calories: selected.calories,
          protein: selected.protein,
          carbs: selected.carbs,
          fat: selected.fat,
          fiber: selected.fiber ?? 0,
          serving_size: selected.serving_size ?? '',
        }).catch(() => {})
      }

      onLogged(entry)
      onClose()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  if (!open) return null

  const cal = selected ? Math.round(selected.calories * servings) : 0
  const pro = selected ? +(selected.protein * servings).toFixed(1) : 0
  const carb = selected ? +(selected.carbs * servings).toFixed(1) : 0
  const fat_ = selected ? +(selected.fat * servings).toFixed(1) : 0
  const fib = selected ? +((selected.fiber ?? 0) * servings).toFixed(1) : 0

  const quickAddCals = /^\d+(\.\d+)?$/.test(query.trim()) ? Number(query.trim()) : null

  return createPortal(
    <>
      {phase === 'scan' && (
        <BarcodeScanner
          onResult={handleBarcodeResult}
          onClose={() => setPhase('search')}
        />
      )}

      {phase !== 'scan' && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mt-3 mb-1 sm:hidden flex-shrink-0" />

            {phase === 'search' && (
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-3 border-b border-surface-border flex-shrink-0">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={query}
                      onChange={e => {
                        setQuery(e.target.value)
                        if (e.target.value.trim()) setTab('all')
                      }}
                      placeholder="Search food…"
                      className="input pl-9 pr-8 w-full"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-muted hover:text-tx-primary transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setPhase('scan')}
                    className="p-2 rounded-lg bg-surface-muted hover:bg-surface-overlay border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors flex-shrink-0"
                    aria-label="Scan barcode"
                  >
                    <Scan className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-surface-muted text-tx-muted transition-colors flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex gap-1 px-4 py-2 bg-surface-overlay border-b border-surface-border flex-shrink-0">
                  {(['recent', 'myfoods', 'all'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 ${
                        tab === t
                          ? 'bg-surface-raised border border-surface-border text-tx-primary shadow-card'
                          : 'text-tx-muted hover:text-tx-primary'
                      }`}
                    >
                      {t === 'recent' ? 'Recent' : t === 'myfoods' ? 'My Foods' : 'Search'}
                    </button>
                  ))}
                </div>

                {rateLimited && (
                  <div className="mx-4 mt-3 flex-shrink-0 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Too many requests — wait a moment and try again
                  </div>
                )}
                {searchError && (
                  <div className="mx-4 mt-3 flex-shrink-0 flex items-center gap-2 rounded-lg border border-error-500/20 bg-error-500/10 px-3 py-2 text-xs text-error-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {searchError}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {tab === 'all' && quickAddCals !== null && (
                    <button
                      onClick={() => selectResult({
                        name: `${quickAddCals} kcal`,
                        calories: quickAddCals,
                        protein: 0, carbs: 0, fat: 0, fiber: 0,
                        serving_size: '1 serving', source: 'off',
                      })}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface-muted transition-colors border-b border-surface-border"
                    >
                      <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-brand-500" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Quick add {quickAddCals} kcal</p>
                        <p className="text-xs text-tx-muted">No macro breakdown</p>
                      </div>
                    </button>
                  )}

                  {tab === 'recent' && (
                    recentItems.length === 0
                      ? <div className="px-4 py-12 text-center text-xs text-tx-muted">No recent items today</div>
                      : recentItems.map((item, i) => (
                          <FoodResultRow key={i} item={item} onClick={() => selectResult(item)} />
                        ))
                  )}

                  {tab === 'myfoods' && (
                    savedFoods.length === 0
                      ? <div className="px-4 py-12 text-center text-xs text-tx-muted">No saved foods yet</div>
                      : savedFoods.map(sf => (
                          <FoodResultRow key={sf.id} item={savedToResult(sf)} onClick={() => selectResult(savedToResult(sf))} />
                        ))
                  )}

                  {tab === 'all' && !query.trim() && (
                    <div className="px-4 py-12 text-center text-xs text-tx-muted">Type to search millions of foods</div>
                  )}

                  {tab === 'all' && query.trim() && searching && (
                    <div className="px-4 py-12 text-center text-xs text-tx-muted">Searching…</div>
                  )}

                  {tab === 'all' && query.trim() && !searching && searchResults.length === 0 && !searchError && !rateLimited && (
                    <div className="px-4 py-12 text-center space-y-2">
                      <p className="text-xs text-tx-muted">No results for "{query}"</p>
                      <button
                        onClick={() => selectResult({
                          name: query.trim(), calories: 0, protein: 0, carbs: 0,
                          fat: 0, fiber: 0, serving_size: '1 serving', source: 'off',
                        })}
                        className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        + Enter "{query.trim()}" manually
                      </button>
                    </div>
                  )}

                  {tab === 'all' && !searching && searchResults.map((item, i) => (
                    <FoodResultRow key={i} item={item} onClick={() => selectResult(item)} />
                  ))}
                </div>
              </>
            )}

            {phase === 'detail' && selected && (
              <>
                <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-surface-border flex-shrink-0">
                  {!editEntry && (
                    <button
                      onClick={() => setPhase('search')}
                      className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors text-tx-muted flex-shrink-0"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-tx-primary text-sm truncate">{selected.name || 'New Entry'}</p>
                    {selected.brand && <p className="text-xs text-tx-muted truncate">{selected.brand}</p>}
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors text-tx-muted flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  {saveError && (
                    <div className="alert-error">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  <div className="p-4 bg-surface-muted/30 border border-surface-border rounded-xl">
                    <div className="text-center mb-3">
                      <span className="stat-value text-3xl tabular-nums">{cal}</span>
                      <span className="text-tx-muted text-sm ml-1">kcal</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Protein', value: pro, cls: 'text-emerald-400' },
                        { label: 'Carbs', value: carb, cls: 'text-amber-400' },
                        { label: 'Fat', value: fat_, cls: 'text-violet-400' },
                        { label: 'Fiber', value: fib, cls: 'text-tx-secondary' },
                      ].map(m => (
                        <div key={m.label}>
                          <p className={`stat-value text-sm tabular-nums ${m.cls}`}>{m.value}g</p>
                          <p className="text-[10px] text-tx-muted">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label mb-2 block">
                      Servings
                      {selected.serving_size && (
                        <span className="text-tx-muted font-normal normal-case tracking-normal ml-1">
                          ({selected.serving_size})
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setServings(s => Math.max(0.5, +(s - 0.5).toFixed(1)))}
                        className="w-10 h-10 rounded-lg bg-surface-muted border border-surface-border flex items-center justify-center hover:bg-surface-overlay transition-colors"
                      >
                        <Minus className="w-4 h-4 text-tx-primary" />
                      </button>
                      <input
                        type="number"
                        value={servings}
                        onChange={e => setServings(Math.max(0.5, Number(e.target.value) || 1))}
                        step="0.5"
                        min="0.5"
                        className="input text-center w-24 tabular-nums"
                      />
                      <button
                        onClick={() => setServings(s => +(s + 0.5).toFixed(1))}
                        className="w-10 h-10 rounded-lg bg-surface-muted border border-surface-border flex items-center justify-center hover:bg-surface-overlay transition-colors"
                      >
                        <Plus className="w-4 h-4 text-tx-primary" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label mb-2 block">Meal</label>
                    <div className="flex flex-wrap gap-2">
                      {MEALS.map(m => (
                        <button
                          key={m}
                          onClick={() => setMeal(m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            meal === m
                              ? 'bg-brand-500 border-brand-500 text-white'
                              : 'bg-surface-muted border-surface-border text-tx-secondary hover:text-tx-primary'
                          }`}
                        >
                          {MEAL_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label mb-1 block">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      max={todayStr()}
                      className="input"
                    />
                  </div>

                  {!editEntry && (
                    <button
                      type="button"
                      onClick={() => setSaveToMyFoods(v => !v)}
                      className="flex items-center gap-3 w-full"
                    >
                      <div className={`relative w-10 h-6 rounded-full border transition-colors flex-shrink-0 ${saveToMyFoods ? 'bg-brand-500 border-brand-500' : 'bg-surface-muted border-surface-border'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${saveToMyFoods ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {saveToMyFoods
                          ? <BookmarkCheck className="w-4 h-4 text-brand-500" />
                          : <Bookmark className="w-4 h-4 text-tx-muted" />
                        }
                        <span className="text-sm text-tx-secondary">Save to My Foods</span>
                      </div>
                    </button>
                  )}
                </div>

                <div className="flex gap-3 px-4 pb-5 pt-3 border-t border-surface-border flex-shrink-0">
                  <button
                    onClick={() => editEntry ? onClose() : setPhase('search')}
                    className="flex-1 px-4 py-3 bg-surface-muted hover:bg-surface-overlay text-tx-secondary rounded-lg transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLog}
                    disabled={saving}
                    className="flex-1 px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {saving ? 'Saving…' : editEntry ? 'Save Changes' : 'Log Food'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}

function FoodResultRow({ item, onClick }: { item: types.FoodSearchResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface-muted transition-colors border-b border-surface-border last:border-0 text-left"
    >
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-surface-border"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0">
          <Utensils className="w-4 h-4 text-tx-muted" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-tx-primary truncate">{item.name}</p>
        {item.brand && <p className="text-xs text-tx-muted truncate">{item.brand}</p>}
        <p className="text-xs text-tx-muted mt-0.5 tabular-nums">
          {Math.round(item.calories)} kcal · {item.protein.toFixed(0)}g P · {item.carbs.toFixed(0)}g C · {item.fat.toFixed(0)}g F
        </p>
      </div>
    </button>
  )
}
