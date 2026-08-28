import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { Dumbbell, Plus, Clock, Search, Edit2, Trash2, TrendingUp, Award, ChevronRight, MoreVertical } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/ui/EmptyState'
import { ListError } from '../components/ui'
import PageHeader from '../components/ui/PageHeader'
import { Toast } from '../components/ui'
import { useServerInfiniteList } from '../hooks/useServerInfiniteList'
import { workoutAPI } from '../services/api'
import { useSettingsStore, weightShort, displayVolume } from '../stores/settings'
import { useAsyncAction, types, workoutDay, dayToLocalDate, calcVolume } from '@lyftr/shared'

function WorkoutCard({ workout, onEdit, onDelete }: { workout: types.Workout; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inMenu = menuRef.current?.contains(e.target as Node)
      const inPortal = portalRef.current?.contains(e.target as Node)
      if (!inMenu && !inPortal) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const durationMin = Math.round(workout.duration / 60)
  const totalVolume = displayVolume(calcVolume(workout), wUnit)

  // Was `catch { setDeleting(false); setConfirming(false) }` — the card quietly came
  // back and the user was left guessing whether the tap had registered. The confirm
  // stays up now and says why, which is the same rule the sheets follow.
  const remove = useAsyncAction(async () => {
    await workoutAPI.delete(workout.id)
    onDelete(workout.id)
  }, 'Failed to delete workout')

  if (confirming) {
    return (
      <div className="card overflow-hidden border-error-500/30">
        <div className="flex items-center justify-between p-4 bg-error-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-error-500/10 border border-error-500/20 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-error-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-tx-primary">Delete "{workout.name}"?</p>
              <p className="text-xs text-tx-muted">This cannot be undone</p>
              {remove.error && <p className="text-xs text-error-400 mt-1">{remove.error}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirming(false)} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={() => { void remove.run() }} disabled={remove.busy} className="btn-danger-solid btn-sm disabled:opacity-50">
              <Trash2 className="w-3 h-3" />
              {remove.busy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card group active:scale-[0.99] transition-transform">
      <div className="flex items-center p-4 gap-3">
        {/* Thumbnail — tappable, navigates to detail */}
        <button
          onClick={() => navigate(`/workouts/${workout.id}`)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          {workout.exercises?.[0]?.exercise?.image_url ? (
            <img
              src={workout.exercises[0].exercise.image_url}
              alt=""
              className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-surface-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-5 h-5 text-brand-500" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tx-primary truncate">{workout.name}</p>
            <p className="text-xs text-tx-muted mt-0.5 whitespace-nowrap">{format(dayToLocalDate(workoutDay(workout)), 'MMM d, yyyy')}</p>
            <div className="flex items-center gap-x-2 mt-0.5 min-w-0 overflow-hidden">
              {durationMin > 0 && (
                <span className="flex items-center gap-1 text-xs text-tx-muted whitespace-nowrap">
                  <Clock className="w-3 h-3 flex-shrink-0" />{durationMin} min
                </span>
              )}
              {durationMin > 0 && <span className="text-tx-muted/40 text-xs">·</span>}
              <span className="text-xs text-tx-muted whitespace-nowrap">{workout.exercises?.length || 0} exercises</span>
              {totalVolume > 0 && (
                <>
                  <span className="text-tx-muted/40 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-tx-muted whitespace-nowrap">
                    <TrendingUp className="w-3 h-3 flex-shrink-0" />{totalVolume.toLocaleString()} {wUnit}
                  </span>
                </>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-tx-muted flex-shrink-0" />
        </button>

        {/* Mobile: kebab menu | Desktop: hover icons */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          {/* Mobile kebab trigger */}
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className={`sm:hidden p-2 rounded-lg transition-colors ${menuOpen ? 'bg-surface-muted' : 'hover:bg-surface-muted'}`}
            aria-label="Options"
          >
            <MoreVertical className="w-4 h-4 text-tx-muted" />
          </button>

          {/* Centered modal dropdown — portal to escape transform stacking context */}
          {menuOpen && createPortal(
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
              />
              <div ref={portalRef} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 bg-surface-overlay border border-surface-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 pt-4 pb-3">
                  <p className="text-[10px] font-semibold text-tx-muted uppercase tracking-wider text-center">Workout</p>
                  <p className="text-sm font-semibold text-tx-primary text-center mt-0.5 truncate">{workout.name}</p>
                </div>
                <div className="border-t border-surface-border/40 py-1.5">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(workout.id) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-tx-primary hover:bg-surface-muted/60 active:bg-surface-muted transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                      <Edit2 className="w-4 h-4 text-brand-500" />
                    </div>
                    Edit Workout
                  </button>
                  <div className="mx-4 border-t border-surface-border/30" />
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); setConfirming(true) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-error-400 hover:bg-error-500/10 active:bg-error-500/15 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-error-500/10 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-error-400" />
                    </div>
                    Delete Workout
                  </button>
                </div>
                <div className="border-t border-surface-border/40 p-3">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
                    className="w-full py-2.5 text-sm font-semibold text-tx-muted bg-surface-muted/60 hover:bg-surface-muted rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}

          {/* Desktop hover icons */}
          <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              aria-label={`Edit ${workout.name}`}
              onClick={e => { e.stopPropagation(); onEdit(workout.id) }}
              className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4 text-brand-500" />
            </button>
            <button
              aria-label="Delete"
              onClick={e => { e.stopPropagation(); setConfirming(true) }}
              className="p-2 hover:bg-error-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4 text-error-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Workouts() {
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Auto-progression toast (#40): the finish flow navigates here with the summary
  // in router state. Capture it once, then wipe history state so it can't replay on
  // back/refresh.
  const [progression, setProgression] = useState<types.ProgressionResult | null>(
    (location.state as { progression?: types.ProgressionResult } | null)?.progression ?? null
  )
  useEffect(() => {
    if ((location.state as { progression?: types.ProgressionResult } | null)?.progression) {
      window.history.replaceState({}, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce search so we don't fire a request on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const {
    items: workouts, sentinelRef, hasMore, loading, initialLoading, reload,
    error: listError, retry: retryList,
  } = useServerInfiniteList<types.Workout>({
    fetcher: (offset, limit) => workoutAPI.list({ offset, limit, q: debouncedSearch || undefined }),
    deps: [debouncedSearch],
  })

  if (initialLoading) return <Loading />

  return (
    <div className="space-y-5 animate-slide-up">
      <PageHeader
        title="Workouts"
        subtitle="Track and review your training sessions"
        action={
          <button onClick={() => navigate('/workouts/new')} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Log Workout
          </button>
        }
      />

      {/* Summary — derived from `workouts`, so it is only true if the list arrived.
          On a failed load the array is empty and these read "0 logged · 0 sessions",
          which is a claim about the user's training, not a blank. The search box and
          Log Workout below still work, so they stay; only the derived numbers go. */}
      {!listError && (
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: workouts.length.toString(), unit: 'logged' },
          // The month the workout was logged in, not the month its UTC instant lands in —
          // a session near a month boundary belongs to the month the lifter trained in.
          { label: 'This Month', value: workouts.filter(w => workoutDay(w).startsWith(format(new Date(), 'yyyy-MM'))).length.toString(), unit: 'sessions' },
          { label: 'Avg Time', value: workouts.length > 0 ? Math.round(workouts.reduce((sum, w) => sum + w.duration, 0) / workouts.length / 60).toString() : '0', unit: 'min' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="stat-label truncate">{s.label}</span>
            </div>
            <div className="flex items-end gap-1 min-w-0">
              <span className="stat-value text-xl">{s.value}</span>
              <span className="text-xs text-tx-muted mb-0.5 truncate">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-10"
          placeholder="Search workouts…"
        />
      </div>

      {/* Workout list */}
      <div className="space-y-2">
        {workouts.length === 0 && !loading ? (
          // An empty list because the fetch failed is not an empty list. Saying "No
          // workouts found · Log a workout to get started" to someone with eight months
          // of history, because their wifi dropped, is the worst thing this screen can do.
          listError ? (
            <ListError subject="your workouts" message={listError} onRetry={retryList} />
          ) : (
            <EmptyState
              icon={Dumbbell}
              title="No workouts found"
              subtitle={search ? 'Try a different search' : 'Log a workout to get started'}
            />
          )
        ) : (
          <>
            {workouts.map(w => <WorkoutCard key={w.id} workout={w}
              onEdit={(id) => navigate(`/workouts/${id}/edit`)}
              onDelete={() => reload()}
            />)}
            <div ref={sentinelRef} />
            {listError && <ListError subject="your workouts" message={listError} onRetry={retryList} />}
            {hasMore && loading && (
              <p className="text-center text-xs text-tx-muted py-2">Loading more…</p>
            )}
          </>
        )}
      </div>

      {progression && (
        <Toast
          variant={progression.is_pr ? 'warning' : 'success'}
          icon={progression.is_pr ? Award : TrendingUp}
          title={progression.is_pr ? `New PR in ${progression.program_name}` : `New targets in ${progression.program_name}`}
          description={`Tap to review ${progression.count} ${progression.count === 1 ? 'update' : 'updates'}`}
          onClick={() => { setProgression(null); navigate(`/programs/${progression.program_id}`) }}
          onDismiss={() => setProgression(null)}
        />
      )}
    </div>
  )
}
