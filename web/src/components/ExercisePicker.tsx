import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Search, Dumbbell } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { exerciseAPI } from '../services/api'
import { types } from '@lyftr/shared'
import { muscleColorBordered, EQUIPMENT_LABEL } from '../utils/exerciseUtils'

// Must match the server's default page size, since a short page is what signals
// the end of the results.
const PAGE_SIZE = 50
// How close to the end of the loaded rows to get before fetching the next page.
const PREFETCH_ROWS = 10

interface Props {
  selectedIds: number[]
  onSelect: (exercise: types.Exercise) => void
  onClose: () => void
}

export default function ExercisePicker({ selectedIds, onSelect, onClose }: Props) {
  const [exercises, setExercises] = useState<types.Exercise[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Guards against the virtualizer asking for the next page repeatedly while the
  // first request for it is still in flight — it fires on every scroll frame, not
  // once per boundary crossing. It only ever suppresses an append: a new search
  // must never be dropped because a page fetch is outstanding.
  const loadingRef = useRef(false)
  // Identifies the newest request so a slow earlier one cannot overwrite it. Typing
  // fast enough to outrun a response otherwise leaves the list showing results for
  // a query the user has already moved on from.
  const reqRef = useRef(0)

  // Results come a page at a time from the server, which queries open-exercise-db.
  // Nothing downloads the catalog to filter it here: with ~873 exercises upstream
  // and growing, the browser is the wrong place to do that, and it put the whole
  // library behind one slow request before the picker could render anything.
  const load = useCallback(async (q: string, nextPage: number, append = false) => {
    if (append && loadingRef.current) return
    const id = ++reqRef.current
    loadingRef.current = true
    setLoading(true)
    try {
      const data = await exerciseAPI.list({ ...(q ? { q } : {}), page: nextPage }) || []
      if (reqRef.current !== id) return // a newer request has taken over
      setExercises(prev => (append ? [...prev, ...data] : data))
      // A short page means the server has nothing left for this query. Asking again
      // would just repeat the request for every remaining scroll event.
      setExhausted(data.length < PAGE_SIZE)
      setPage(nextPage)
    } catch { /* a failed search keeps the previous list rather than blanking it */ }
    finally {
      if (reqRef.current === id) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [])

  // One effect, not two. An initial load plus a debounced query effect both fire
  // on mount, so opening the picker fetched page 1 twice — the debounce only
  // staggered them. Debouncing the empty query by zero gives the first page
  // immediately and still waits out typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setExhausted(false)
      load(query, 1)
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, load])

  const available = exercises.filter(e => !selectedIds.includes(e.id))

  const virtualizer = useVirtualizer({
    count: available.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(() => 64, []),
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Fetch the next page as the last rendered row approaches the end of what we
  // hold. Keyed on the last visible index rather than a scroll handler so it works
  // with the virtualizer's own windowing.
  const lastVisible = virtualItems.length ? virtualItems[virtualItems.length - 1].index : 0
  useEffect(() => {
    if (exhausted || loading || available.length === 0) return
    if (lastVisible >= available.length - PREFETCH_ROWS) load(query, page + 1, true)
  }, [lastVisible, available.length, exhausted, loading, query, page, load])

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-surface-base flex flex-col animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-surface-border flex-shrink-0 bg-surface-base/95 backdrop-blur">
        <button
          onClick={onClose}
          className="p-2 hover:bg-surface-muted rounded-lg transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div>
          <h2 className="font-display font-bold text-xl text-tx-primary">Add Exercise</h2>
          <p className="text-xs text-tx-muted">
            {available.length} loaded{exhausted ? '' : '…'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-surface-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="input pl-10 w-full"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading && exercises.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-tx-muted text-sm">
            <Dumbbell className="w-5 h-5 mr-2 animate-pulse text-brand-500" />
            Loading exercises…
          </div>
        ) : available.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-tx-muted text-sm">
            No exercises found
          </div>
        ) : (
          <div
            className="px-4 py-2 relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map(row => {
              const ex = available[row.index]
              return (
                <div
                  key={ex.id}
                  style={{
                    position: 'absolute',
                    top: row.start,
                    left: 0,
                    right: 0,
                    height: row.size,
                    padding: '0 1rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(ex)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-muted transition-colors text-left"
                  >
                    {ex.image_url ? (
                      <img
                        src={ex.image_url}
                        alt=""
                        loading="lazy"
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-surface-muted"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Dumbbell className="w-4 h-4 text-brand-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-tx-primary truncate">{ex.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${muscleColorBordered(ex.muscle_group)}`}>
                          {ex.muscle_group}
                        </span>
                        {ex.equipment && ex.equipment !== 'other' && (
                          <span className="text-xs text-tx-muted">
                            {EQUIPMENT_LABEL[ex.equipment] || ex.equipment}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
