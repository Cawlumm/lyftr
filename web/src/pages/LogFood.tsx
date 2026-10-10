import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Search, Scan, Minus, Plus, X,
  Star, AlertCircle, Utensils, Zap,
  Coffee, Sun, Moon, Cookie, ChevronRight, Loader2,
} from 'lucide-react'
import { foodAPI, savedFoodsAPI } from '../services/api'
import { isNotFound, useAsyncAction, useTranslation, uiMessage, type UiMessage, todayStr, dayToInstant, entryDay, foodResultKey, MACRO_COLORS, types, entryToResult, savedToResult, scaleServing, scaledFigures, useFavorites, useFoodAmount } from '@lyftr/shared'
import { ErrorState, ListError, Toast } from '../components/ui'
import BarcodeScanner from '../components/BarcodeScanner'
import BarcodeLookup from '../components/BarcodeLookup'
import FavoriteStar from '../components/FavoriteStar'
import IconButton from '../components/ui/IconButton'
import SegmentedControl from '../components/ui/SegmentedControl'
import DateInput from '../components/ui/DateInput'
import { FoodHero, FoodThumb } from '../components/FoodImage'

type Phase = 'search' | 'detail' | 'scan'
type SearchTab = 'recent' | 'myfoods' | 'all'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const MEAL_ICONS: Record<string, React.ElementType> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snacks: Cookie,
}
const MEAL_COLORS: Record<string, string> = {
  breakfast: 'text-amber-400', lunch: 'text-yellow-400',
  dinner: 'text-indigo-400', snacks: 'text-pink-400',
}

// The star is the whole favourites mechanic: one tap on, one tap off, from every tab.
// It replaces the trash + inline confirm this row briefly had, which only appeared on the
// Favorites tab — so a food found by search could not be favourited without logging it.
//
// No confirmation, deliberately: a favourite is a bookmark, not a record, and a second
// click restores it. Matches Cronometer.
//
// The star has to be a sibling of the row button, not a child: a <button> inside a
// <button> is invalid HTML and React warns about it, which is why the two-branch shape
// below exists instead of one container.
function FoodResultRow(
  { item, onClick, favorited, onToggleFavorite, togglingFavorite = false, loading = false }:
  {
    item: types.FoodSearchResult
    onClick: () => void
    favorited: boolean
    onToggleFavorite: () => void
    togglingFavorite?: boolean
    /** The product behind this row is being read in full before the detail opens. */
    loading?: boolean
  },
) {
  const { t } = useTranslation()
  const content = (
    <>
      <FoodThumb src={item.image_url} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-tx-primary truncate">{item.name}</p>
        {item.brand && <p className="text-xs text-tx-muted truncate mt-0.5">{item.brand}</p>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs font-semibold text-tx-secondary tabular-nums">{Math.round(item.calories)} kcal</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-emerald-400 tabular-nums">{item.protein.toFixed(0)}g {t('food.macro.proteinInitial')}</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-amber-400 tabular-nums">{item.carbs.toFixed(0)}g {t('food.macro.carbsInitial')}</span>
          <span className="text-[10px] text-tx-muted">·</span>
          <span className="text-xs text-violet-400 tabular-nums">{item.fat.toFixed(0)}g {t('food.macro.fatInitial')}</span>
          {item.serving_size && (
            <>
              <span className="text-[10px] text-tx-muted">·</span>
              <span className="text-[10px] text-tx-muted">{item.serving_size}</span>
            </>
          )}
        </div>
      </div>
      {loading
        ? <Loader2 className="w-4 h-4 text-tx-muted flex-shrink-0 animate-spin" />
        : <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />}
    </>
  )

  return (
    <div className="flex items-center gap-2 w-full px-4 hover:bg-surface-muted transition-colors border-b border-surface-border last:border-0">
      <button onClick={onClick} disabled={loading} className="flex items-center gap-3 flex-1 min-w-0 py-3.5 text-left">
        {content}
      </button>
      <FavoriteStar
        favorited={favorited}
        busy={togglingFavorite}
        name={item.name}
        onClick={onToggleFavorite}
      />
    </div>
  )
}

export default function LogFood() {
  const { t } = useTranslation()
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
  // Starring lives in useFavorites, shared with the diary so the rules can't drift (#138).
  const favorites = useFavorites(savedFoodsAPI)
  const { savedFoods, setSavedFoods, favoriteOf, isToggling, toggle: toggleFavorite } = favorites
  // Each list's own failure. Kept separate from the page: one of these failing is not a
  // reason to withhold search, and an empty list that failed to load must not draw the
  // same "nothing here" as a list that really is empty.
  const [recentError, setRecentError] = useState<UiMessage | null>(null)
  const [savedError, setSavedError] = useState<UiMessage | null>(null)
  const [listReload, setListReload] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<UiMessage | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  // A barcode lookup goes through Open Food Facts and routinely takes seconds (the
  // server allows it 5). The scanner closes the moment it reads a code, so without
  // this the screen sat unchanged and people rescanned, thinking it had failed (#164).
  // null: no lookup. error null: in flight. error set: failed, in the server's words.
  const [lookup, setLookup] = useState<{ code: string; error: UiMessage | null } | null>(null)
  const lookingUp = lookup !== null && lookup.error === null

  const [selected, setSelected] = useState<types.FoodSearchResult | null>(null)
  // The amount field — grams, millilitres or servings, depending on the food. Shared
  // with mobile, because what it computes is how much food the person recorded (#171).
  const amount = useFoodAmount(selected)
  const { basis, servings, servingsLabel, overLimit, limitHint, openOnEntry } = amount
  // Which search row is being re-read in full, and what to say if that failed. The
  // search index answers with per-100g figures and no serving at all, so a hit has to
  // be read again through the product endpoint before it can be trusted (#171).
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [staleServing, setStaleServing] = useState<UiMessage | null>(null)
  const [meal, setMeal] = useState<types.FoodLog['meal']>(initMeal)
  const [date, setDate] = useState(initDate)


  const [editError, setEditError] = useState<UiMessage | null>(null)
  const [editRetry, setEditRetry] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editId) return
    foodAPI.get(editId).then(entry => {
      const result = entryToResult(entry)
      setSelected(result)
      openOnEntry(result, entry.servings)
      setMeal(entry.meal)
      setDate(entryDay(entry))
      setPhase('detail')
    }).catch(err => setEditError({ key: 'settings.unknownError', cause: err }))
  }, [editId, navigate, editRetry, openOnEntry])

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
      setRecentError(null)
    }).catch(err => setRecentError({ key: 'food.log.recent.loadFailed', cause: err }))
    savedFoodsAPI.list()
      .then(list => { setSavedFoods(list); setSavedError(null) })
      .catch(err => setSavedError({ key: 'food.favorites.loadFailed', cause: err }))
  }, [listReload, setSavedFoods])

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
        else setSearchError({ key: 'food.log.searchUnavailable' })
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, tab])

  const selectResult = (result: types.FoodSearchResult, note: UiMessage | null = null) => {
    setSelected(result)
    amount.openOn(result)
    setStaleServing(note)
    setPhase('detail')
  }

  // A search hit is not enough to log against. OpenFoodFacts' search index carries
  // per-100g figures and no serving at all, so the same olive oil reads 800 kcal per
  // 100 g from a search and 120 kcal per tablespoon from a scan (#171). Read the
  // product in full before opening the detail, the way every other OFF client does.
  const selectSearchResult = async (result: types.FoodSearchResult) => {
    if (result.source !== 'off' || !result.barcode) { selectResult(result); return }
    setUpgrading(result.barcode)
    try {
      selectResult(await foodAPI.barcode(result.barcode))
    } catch (err) {
      // The search row is still real data, so log against it rather than dead-ending —
      // but say which figures these are, because they are the ones that read wrong.
      selectResult(result, { key: 'food.log.rereadFailed', cause: err })
    } finally {
      setUpgrading(null)
    }
  }

  const enterManually = () => {
    setLookup(null)
    selectResult({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: t('food.servings', { count: 1 }), source: 'manual' })
  }

  const lookUpBarcode = async (code: string) => {
    setPhase('search')
    setLookup({ code, error: null })
    try {
      selectResult(await foodAPI.barcode(code))
      setLookup(null)
    } catch (err) {
      // Only a 404 means the product isn't in the database. A timeout or an
      // unreachable upstream is not an answer, and saying "not found" for it sent
      // people to type in a product that does exist.
      if (isNotFound(err)) enterManually()
      else setLookup({ code, error: { key: 'food.log.lookupFailed', cause: err } })
    }
  }

  const save = useAsyncAction(async (item: types.FoodSearchResult) => {
        const payload = {
          ...scaleServing(item, servings),
          meal,
          logged_at: dayToInstant(date),
        }
        if (editId) {
          await foodAPI.update(editId, payload)
        } else {
          await foodAPI.log(payload)
        }
        navigate('/food', { replace: true })
  }, t('food.log.saveFailed'))

  const handleLog = async () => {
    if (!selected || save.busy) return
    void save.run(selected)
  }

  if (phase === 'scan') {
    return (
      <BarcodeScanner
        onResult={lookUpBarcode}
        onClose={() => setPhase('search')}
      />
    )
  }

  // The route exists to edit ONE entry; if that entry never arrived there is nothing
  // to show but the search screen, which answers a question the user did not ask.
  if (editId && editError) {
    return (
      <ErrorState
        size="page"
        title={t('food.entry.loadFailed')}
        message={uiMessage(editError)}
        onRetry={() => { setEditError(null); setEditRetry(k => k + 1) }}
        secondary={<button onClick={() => navigate('/food')} className="btn-secondary btn-sm">{t('food.log.backToFood')}</button>}
      />
    )
  }

  const figures = selected ? scaledFigures(selected, servings) : null
  const pro = figures?.protein ?? 0
  const carb = figures?.carbs ?? 0
  const fat_ = figures?.fat ?? 0
  const quickAddCals = /^\d+(\.\d+)?$/.test(query.trim()) ? Number(query.trim()) : null

  return (
    <div className="animate-slide-up flex flex-col min-h-0">
      {/* Header with breadcrumb */}
      <div className="flex items-center gap-3 mb-5">
        <button
          aria-label={t('common.goBack')}
          onClick={() => phase === 'detail' && !editId ? setPhase('search') : navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-muted active:scale-95 transition-all flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div className="flex-1 min-w-0">
          {phase === 'detail' && selected ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-tx-muted mb-0.5">
                <span>{editId ? t('food.log.editTitle') : t('food.log.title')}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-tx-secondary">{t('food.log.details')}</span>
              </div>
              <h1 className="font-display font-bold text-xl text-tx-primary truncate">
                {selected.name || t('food.log.newEntry')}
              </h1>
              {selected.brand && <p className="text-xs text-tx-muted mt-0.5">{selected.brand}</p>}
            </>
          ) : (
            <h1 className="font-display font-bold text-2xl text-tx-primary">{t('food.log.title')}</h1>
          )}
        </div>
        {/* Favouriting is decoupled from logging, so the star sits beside the food rather
            than inside the form — you can star something without logging it, and unstar
            it the same way. Hidden in edit mode, where `selected` is a logged entry being
            amended rather than a food being picked. */}
        {phase === 'detail' && selected && !editId && selected.name && (
          <FavoriteStar
            size="md"
            favorited={favoriteOf(selected) !== undefined}
            busy={isToggling(selected)}
            name={selected.name}
            onClick={() => toggleFavorite(selected)}
          />
        )}
      </div>

      {/* A toast, not a banner: the star is on the rows *and* in the header, and the
          failed star has already snapped back, so this only has to say why. */}
      {favorites.error && <Toast variant="error" icon={AlertCircle} title={favorites.error} onDismiss={() => favorites.setError(null)} />}

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
                onChange={e => { setQuery(e.target.value); if (e.target.value.trim()) setTab('all'); if (lookup?.error) setLookup(null) }}
                placeholder={t('food.log.searchPlaceholder')}
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
              disabled={lookingUp}
              className="flex items-center gap-1.5 px-3.5 h-12 rounded-xl bg-surface-muted hover:bg-surface-overlay border border-surface-border text-tx-secondary hover:text-tx-primary transition-colors flex-shrink-0 disabled:opacity-40 disabled:pointer-events-none"
              aria-label={t('food.log.scanLabel')}
            >
              <Scan className="w-5 h-5" />
              <span className="text-xs font-medium">{t('food.log.scan')}</span>
            </button>
          </div>

          {/* Tabs */}
          <SegmentedControl
            options={[
              { value: 'recent', label: t('food.log.tab.recent') },
              { value: 'myfoods', label: t('food.log.tab.favorites') },
              { value: 'all', label: t('food.log.tab.search') },
            ] as const}
            value={tab}
            onChange={v => { setTab(v); if (lookup?.error) setLookup(null) }}
          />

          {rateLimited && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('food.log.rateLimited')}
            </div>
          )}
          {searchError && (
            <div className="flex items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-3.5 py-3 text-xs text-error-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uiMessage(searchError)}
            </div>
          )}

          {/* Results */}
          {lookup && lookup.error === null ? (
            <BarcodeLookup code={lookup.code} />
          ) : lookup?.error ? (
            // In place of the results rather than a banner above them: the lookup is
            // what failed, and both ways forward keep the code already scanned.
            <div className="card">
              <ErrorState
                title={t('food.log.lookupFailedTitle')}
                message={uiMessage(lookup.error)}
                onRetry={() => lookUpBarcode(lookup.code)}
                secondary={<button onClick={enterManually} className="btn-secondary btn-sm">{t('food.log.enterManually')}</button>}
              />
            </div>
          ) : (
          <div className="card overflow-hidden">
            {tab === 'all' && quickAddCals !== null && (
              <button
                onClick={() => selectResult({ name: `${quickAddCals} kcal`, calories: quickAddCals, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: t('food.servings', { count: 1 }), source: 'off' })}
                className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-surface-muted transition-colors border-b border-surface-border"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-tx-primary">{t('food.log.quickAdd', { kcal: quickAddCals })}</p>
                  <p className="text-xs text-tx-muted mt-0.5">{t('food.log.noMacroBreakdown')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
              </button>
            )}

            {tab === 'recent' && (
              recentError
                ? <ListError subject={t('food.log.recent.subject')} message={uiMessage(recentError)} onRetry={() => { setRecentError(null); setListReload(n => n + 1) }} />
                : recentItems.length === 0
                ? (
                  <div className="px-4 py-14 text-center">
                    <Utensils className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                    <p className="text-sm text-tx-muted">{t('food.log.recent.empty.title')}</p>
                    <p className="text-xs text-tx-muted mt-1 opacity-60">{t('food.log.recent.empty.hint')}</p>
                  </div>
                )
                : recentItems.map((item, i) => (
                  <FoodResultRow
                    key={foodResultKey(item, i)}
                    item={item}
                    onClick={() => selectResult(item)}
                    favorited={favoriteOf(item) !== undefined}
                    onToggleFavorite={() => toggleFavorite(item)}
                    togglingFavorite={isToggling(item)}
                  />
                ))
            )}

            {tab === 'myfoods' && (
              savedError
                ? <ListError subject={t('food.favorites.subject')} message={uiMessage(savedError)} onRetry={() => { setSavedError(null); setListReload(n => n + 1) }} />
                : savedFoods.length === 0
                ? (
                  <div className="px-4 py-14 text-center">
                    <Star className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                    <p className="text-sm text-tx-muted">{t('food.favorites.empty.title')}</p>
                    <p className="text-xs text-tx-muted mt-1 opacity-60">{t('food.favorites.empty.hint')}</p>
                  </div>
                )
                : savedFoods.map(sf => {
                  const item = savedToResult(sf)
                  return (
                    <FoodResultRow
                      key={sf.id}
                      item={item}
                      onClick={() => selectResult(item)}
                      favorited
                      onToggleFavorite={() => toggleFavorite(item)}
                      togglingFavorite={isToggling(item)}
                    />
                  )
                })
            )}

            {tab === 'all' && !query.trim() && (
              <div className="px-4 py-14 text-center">
                <Search className="w-8 h-8 text-tx-muted opacity-30 mx-auto mb-2" />
                <p className="text-sm text-tx-muted">{t('food.log.search.emptyTitle')}</p>
                <p className="text-xs text-tx-muted mt-1 opacity-60">{t('food.log.search.emptyHint')}</p>
              </div>
            )}
            {tab === 'all' && query.trim() && searching && (
              <div className="px-4 py-14 text-center text-sm text-tx-muted">{t('food.log.search.searching')}</div>
            )}
            {tab === 'all' && query.trim() && !searching && searchResults.length === 0 && !searchError && !rateLimited && (
              <div className="px-4 py-14 text-center space-y-3">
                <p className="text-sm text-tx-muted">{t('food.log.search.noResults', { query })}</p>
                <button
                  onClick={() => selectResult({ name: query.trim(), calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: t('food.servings', { count: 1 }), source: 'off' })}
                  className="btn-secondary text-xs"
                >
                  {t('food.log.search.manualEntry', { query: query.trim() })}
                </button>
              </div>
            )}
            {tab === 'all' && !searching && searchResults.map((item, i) => (
              <FoodResultRow
                key={foodResultKey(item, i)}
                item={item}
                loading={upgrading !== null && upgrading === item.barcode}
                onClick={() => void selectSearchResult(item)}
                    favorited={favoriteOf(item) !== undefined}
                    onToggleFavorite={() => toggleFavorite(item)}
                    togglingFavorite={isToggling(item)}
              />
            ))}
          </div>
          )}
        </div>
      )}

      {/* Detail phase */}
      {phase === 'detail' && selected && (
        <div className="space-y-4 pb-32">
          {save.error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{save.error}</span>
            </div>
          )}

          {/* The product couldn't be re-read, so these are the search index's figures:
              per 100 g, whatever the pack's own serving is. Say so rather than let them
              read as a serving — that is the whole of #171. */}
          {staleServing && (
            <div className="alert-warning">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{t('food.log.staleServing', { note: uiMessage(staleServing), serving: selected.serving_size })}</span>
            </div>
          )}

          {/* Food hero + macros */}
          <div className="card overflow-hidden">
            <FoodHero src={selected.image_url} alt={selected.name} />

            <div className="p-5">
              {/* Calorie hero */}
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tabular-nums text-tx-primary leading-none">{figures?.calories ?? '—'}</span>
                    <span className="text-sm text-tx-muted">kcal</span>
                  </div>
                  {selected.serving_size && (
                    <p className="text-xs text-tx-muted mt-1">
                      {/* The label comes from OpenFoodFacts, which is free text — and rows
                          logged before the backend stopped prefixing it still read "per
                          100g". Supplying a second "per" gave "per per 100g". */}
                      {t('food.log.per', { serving: `${servingsLabel === 1 || !figures ? '' : `${servingsLabel} × `}${selected.serving_size.replace(/^per\s+/i, '')}` })}
                    </p>
                  )}
                </div>
                {/* Macro composition mini-bars */}
                {(pro + carb + fat_) > 0 && (
                  <div className="flex flex-col gap-1 items-end w-20 flex-shrink-0">
                    {([
                      { key: 'protein', value: pro, color: MACRO_COLORS.protein },
                      { key: 'carbs', value: carb, color: MACRO_COLORS.carbs },
                      { key: 'fat', value: fat_, color: MACRO_COLORS.fat },
                    ] as const).map(m => {
                      const total = pro + carb + fat_
                      const pct = total > 0 ? Math.round((m.value / total) * 100) : 0
                      return (
                        <div key={m.key} className="flex items-center gap-1.5 w-full">
                          <span className="text-[10px] text-tx-muted w-3 text-right flex-shrink-0">{t(`food.macro.${m.key}Initial`)}</span>
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
                {([
                  { key: 'protein', value: figures ? `${pro}g` : '—', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  { key: 'carbs',   value: figures ? `${carb}g` : '—', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
                  { key: 'fat',     value: figures ? `${fat_}g` : '—', color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20' },
                  { key: 'fiber',   value: figures ? `${figures.fiber}g` : '—', color: 'text-tx-secondary', bg: 'bg-surface-muted border-surface-border' },
                ] as const).map(m => (
                  <div key={m.key} className={`rounded-xl border p-2.5 text-center ${m.bg}`}>
                    <p className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    <p className="text-[10px] text-tx-muted mt-0.5">{t(`food.macro.${m.key}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="card p-4 space-y-3">
            <div className="flex items-baseline gap-2">
              <label className="label" htmlFor="food-amount">{basis ? t('food.entry.amount') : t('food.log.servings')}</label>
              {selected.serving_size && !basis && (
                <span className="text-xs text-tx-muted">{t('food.log.servingEach', { serving: selected.serving_size })}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <IconButton icon={Minus} variant="secondary" size="lg" label={basis ? t('food.log.decreaseAmount') : t('food.log.decreaseServings')} onClick={() => amount.step(-1)} />
              <div className="relative flex-1">
                <input
                  id="food-amount"
                  type="number"
                  inputMode="decimal"
                  value={amount.text}
                  onChange={e => amount.setText(e.target.value)}
                  // No minimum: a tablespoon of oil is 0.15 of the 100 ml OpenFoodFacts
                  // holds the figures for, and flooring this at 0.5 is what made that
                  // bottle unloggable (#171). The server has never had a floor.
                  min="0"
                  step="any"
                  aria-label={basis ? t('food.log.amountIn', { unit: basis.unit }) : t('food.log.servings')}
                  className={`input input-no-spin text-center h-12 text-lg font-semibold tabular-nums ${basis ? 'pr-9' : ''}`}
                />
                {basis && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-tx-muted pointer-events-none">
                    {basis.unit}
                  </span>
                )}
              </div>
              <IconButton icon={Plus} variant="secondary" size="lg" label={basis ? t('food.log.increaseAmount') : t('food.log.increaseServings')} onClick={() => amount.step(1)} />
            </div>
            {/* The readout doubles as the reason the Log button is disabled. Deleting the
                0.5-serving floor made an empty or nonsense amount reachable for the first
                time, and "0 servings" beside a dead button says what, not why. */}
            {servings <= 0 ? (
              <p className="text-xs text-tx-muted text-center">
                {basis ? t('food.log.enterAmountIn', { unit: basis.unit }) : t('food.log.enterAmount')}
              </p>
            ) : limitHint ? (
              <p className="text-xs text-warning-400 text-center" role="status">{limitHint}</p>
            ) : basis && (
              <p className="text-xs text-tx-muted text-center">
                {t('food.log.servingsOf', { count: servingsLabel, serving: selected.serving_size })}
              </p>
            )}
          </div>

          {/* Log to: meal + when */}
          <div className="card p-4 space-y-5">
            {/* Meal */}
            <div className="space-y-3">
              <label className="label">{t('food.entry.meal')}</label>
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
                      {t(`food.meal.${m}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-surface-border" />

            <DateInput label={t('food.log.when')} value={date} onChange={setDate} max={todayStr()} />
          </div>

        </div>
      )}

      {/* Sticky log button — detail phase only */}
      {phase === 'detail' && selected && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-surface-base/95 backdrop-blur-sm border-t border-surface-border safe-area-bottom">
          <button
            onClick={handleLog}
            // An empty or zero amount would log a row of zeroes.
            disabled={save.busy || servings <= 0 || overLimit}
            className="btn-primary btn-lg w-full"
          >
            {save.busy ? t('common.saving') : editId ? t('food.log.saveChanges') : t('food.log.submit')}
          </button>
        </div>
      )}
    </div>
  )
}
