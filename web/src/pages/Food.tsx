import { useState } from 'react'
import { Plus, Search, Utensils, Flame, Info, ChevronRight, X } from 'lucide-react'
import { HelpTip } from '../components/Tooltip'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const

const MOCK_LOG: Record<string, { id: number; name: string; cals: number; p: number; c: number; f: number; qty: string }[]> = {
  Breakfast: [
    { id: 1, name: 'Greek Yogurt', cals: 130, p: 22, c: 9,  f: 0,  qty: '1 cup' },
    { id: 2, name: 'Blueberries',  cals: 84,  p: 1,  c: 21, f: 0,  qty: '1 cup' },
    { id: 3, name: 'Oats',         cals: 150, p: 5,  c: 27, f: 3,  qty: '0.5 cup' },
  ],
  Lunch: [
    { id: 4, name: 'Chicken Breast', cals: 330, p: 62, c: 0,  f: 7,  qty: '200g' },
    { id: 5, name: 'Brown Rice',     cals: 215, p: 5,  c: 45, f: 2,  qty: '1 cup' },
    { id: 6, name: 'Broccoli',       cals: 55,  p: 4,  c: 11, f: 1,  qty: '1 cup' },
  ],
  Dinner: [],
  Snacks: [
    { id: 7, name: 'Protein Bar', cals: 220, p: 20, c: 25, f: 8, qty: '1 bar' },
  ],
}

const TOTALS = { cals: 1184, p: 119, c: 138, f: 21 }
const TARGETS = { cals: 2000, p: 150, c: 250, f: 65 }

function MacroChip({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, (value / target) * 100)
  return (
    <div className="flex-1">
      <div className="flex justify-between items-center mb-1.5">
        <span className="stat-label">{label}</span>
        <span className="text-xs font-semibold text-tx-primary tabular-nums">
          {value}<span className="text-tx-muted font-normal">/{target}g</span>
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function Food() {
  const [search, setSearch] = useState('')
  const [activeAdd, setActiveAdd] = useState<string | null>(null)

  const remaining = TARGETS.cals - TOTALS.cals

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl text-tx-primary">Nutrition</h1>
          <p className="text-tx-muted text-sm mt-0.5">Log meals and track your macros</p>
        </div>
        <button className="btn-secondary btn-sm">
          <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          Prev
        </button>
      </div>

      {/* Daily summary */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5">
            <h2 className="section-title">Today's Summary</h2>
            <HelpTip content="All meals logged today. Targets are set in Settings." />
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium ${remaining > 0 ? 'text-tx-muted' : 'text-warning-400'}`}>
            <Flame className="w-3.5 h-3.5" />
            {remaining > 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over`}
          </div>
        </div>

        {/* Calorie ring placeholder + macros */}
        <div className="flex items-center gap-6">
          {/* Calorie summary */}
          <div className="text-center flex-shrink-0">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface-overlay)" strokeWidth="8" />
                <circle cx="40" cy="40" r="32" fill="none" stroke="#00b8d9" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 32}`}
                  strokeDashoffset={`${2 * Math.PI * 32 * (1 - TOTALS.cals / TARGETS.cals)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display font-bold text-lg text-tx-primary leading-none tabular-nums">{TOTALS.cals}</span>
                <span className="text-xs text-tx-muted">kcal</span>
              </div>
            </div>
            <p className="text-xs text-tx-muted mt-1">of {TARGETS.cals}</p>
          </div>

          {/* Macro bars */}
          <div className="flex-1 space-y-3">
            <MacroChip label="Protein" value={TOTALS.p} target={TARGETS.p} color="#00b8d9" />
            <MacroChip label="Carbs"   value={TOTALS.c} target={TARGETS.c} color="#f59e0b" />
            <MacroChip label="Fat"     value={TOTALS.f} target={TARGETS.f} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* Meal sections */}
      {MEALS.map(meal => {
        const entries = MOCK_LOG[meal] ?? []
        const mealCals = entries.reduce((sum, e) => sum + e.cals, 0)
        const isAdding = activeAdd === meal

        return (
          <div key={meal} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-tx-primary">{meal}</span>
                {mealCals > 0 && (
                  <span className="badge-dim">{mealCals} kcal</span>
                )}
              </div>
              <button
                onClick={() => setActiveAdd(isAdding ? null : meal)}
                className="btn-ghost btn-icon-sm"
              >
                {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>

            {isAdding && (
              <div className="px-4 py-3 bg-surface-muted border-b border-surface-border animate-slide-up">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tx-muted pointer-events-none" />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input pl-9 py-2 text-xs"
                    placeholder="Search food database…"
                  />
                </div>
                <p className="input-help flex items-center gap-1 mt-2">
                  <Info className="w-3 h-3" />
                  Search over 300,000 foods from the USDA database
                </p>
              </div>
            )}

            {entries.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Utensils className="w-5 h-5 text-tx-muted mx-auto mb-2" />
                <p className="text-xs text-tx-muted">Nothing logged yet</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors group">
                    <div>
                      <p className="text-sm font-medium text-tx-primary">{entry.name}</p>
                      <p className="text-xs text-tx-muted">{entry.qty}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex gap-3 text-xs text-tx-muted tabular-nums">
                        <span>{entry.p}g P</span>
                        <span>{entry.c}g C</span>
                        <span>{entry.f}g F</span>
                      </div>
                      <span className="text-sm font-semibold text-tx-primary tabular-nums">{entry.cals}</span>
                      <button className="btn-icon-sm btn-ghost opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
