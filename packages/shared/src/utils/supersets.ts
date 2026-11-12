import { nextIncompleteSet } from './workoutSets'

export type SupersetRow = { superset_group?: number | null }
type SetsRow = { sets: { completed?: boolean }[] }

export interface SupersetTarget {
  exIdx: number
  setIdx: number
}

// A group is a run of adjacent rows sharing one non-null label. A label that appears in two
// separate runs is two groups, so a stale label can never bridge rows that are not neighbours.
function runs(rows: SupersetRow[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let i = 0
  while (i < rows.length) {
    const g = rows[i].superset_group ?? null
    let j = i
    while (j + 1 < rows.length && g !== null && (rows[j + 1].superset_group ?? null) === g) j++
    if (g !== null && j > i) out.push({ start: i, end: j })
    i = j + 1
  }
  return out
}

// Relabels groups 1..n in row order and dissolves single-member runs. It never reorders rows.
// Returns the same array when nothing needed to change.
export function normaliseSupersets<T extends SupersetRow>(rows: T[]): T[] {
  const want: (number | null)[] = rows.map(() => null)
  runs(rows).forEach(({ start, end }, n) => {
    for (let k = start; k <= end; k++) want[k] = n + 1
  })
  const changed = rows.some((r, i) => (r.superset_group ?? null) !== want[i])
  if (!changed) return rows
  return rows.map((r, i) => ((r.superset_group ?? null) === want[i] ? r : { ...r, superset_group: want[i] }))
}

export function isLinkedToNext(rows: SupersetRow[], i: number): boolean {
  if (i < 0 || i + 1 >= rows.length) return false
  const g = rows[i].superset_group ?? null
  return g !== null && g === (rows[i + 1].superset_group ?? null)
}

const freshLabel = (rows: SupersetRow[]) => rows.reduce((m, r) => Math.max(m, r.superset_group ?? 0), 0) + 1

export function linkWithNext<T extends SupersetRow>(input: T[], i: number): T[] {
  if (i < 0 || i + 1 >= input.length) return input
  const rows = normaliseSupersets(input)
  const a = rows[i].superset_group ?? null
  const b = rows[i + 1].superset_group ?? null
  if (a !== null && a === b) return rows
  let relabel: (k: number) => number | null
  if (a === null && b === null) {
    const label = freshLabel(rows)
    relabel = (k) => (k === i || k === i + 1 ? label : null)
  } else if (a !== null && b === null) {
    relabel = (k) => (k === i + 1 ? a : null)
  } else if (a === null && b !== null) {
    relabel = (k) => (k === i ? b : null)
  } else {
    const run = runs(rows).find((r) => r.start === i + 1)
    relabel = (k) => (run && k >= run.start && k <= run.end ? a : null)
  }
  const next = rows.map((r, k) => {
    const g = relabel(k)
    return g === null ? r : { ...r, superset_group: g }
  })
  return normaliseSupersets(next)
}

export function unlinkFromNext<T extends SupersetRow>(input: T[], i: number): T[] {
  const rows = normaliseSupersets(input)
  if (!isLinkedToNext(rows, i)) return rows
  const run = runs(rows).find((r) => r.start <= i && i < r.end)
  if (!run) return rows
  const label = freshLabel(rows)
  const next = rows.map((r, k) => (k > i && k <= run.end ? { ...r, superset_group: label } : r))
  return normaliseSupersets(next)
}

export function groupOf(rows: SupersetRow[], i: number): { start: number; end: number; letter: string } | null {
  const all = runs(rows)
  const n = all.findIndex((r) => r.start <= i && i <= r.end)
  if (n < 0) return null
  return { start: all[n].start, end: all[n].end, letter: String.fromCharCode(65 + (n % 26)) }
}

// Round by round; inside a round, members in list order, skipping members with no set at that
// index. Warm-up sets count, matching how a session already indexes sets.
export function supersetSteps(rows: { sets: unknown[] }[], start: number, end: number): SupersetTarget[] {
  let rounds = 0
  for (let k = start; k <= end; k++) rounds = Math.max(rounds, rows[k]?.sets?.length ?? 0)
  const steps: SupersetTarget[] = []
  for (let s = 0; s < rounds; s++) {
    for (let k = start; k <= end; k++) if (s < (rows[k]?.sets?.length ?? 0)) steps.push({ exIdx: k, setIdx: s })
  }
  return steps
}

// The step to focus after (exIdx, setIdx): the first incomplete one after it, wrapping to
// earlier skipped ones. Pass setIdx -1 to ask for the first incomplete step of a member's group.
export function nextSupersetTarget(exercises: (SupersetRow & SetsRow)[], exIdx: number, setIdx: number): SupersetTarget | null {
  const ex = exercises[exIdx]
  if (!ex) return null
  const g = groupOf(exercises, exIdx)
  if (!g) {
    const s = nextIncompleteSet(ex.sets ?? [], setIdx)
    return s >= 0 ? { exIdx, setIdx: s } : null
  }
  const steps = supersetSteps(exercises, g.start, g.end)
  const cur = steps.findIndex((t) => t.exIdx === exIdx && t.setIdx === setIdx)
  const open = (t: SupersetTarget) => !exercises[t.exIdx].sets[t.setIdx]?.completed
  return steps.slice(cur + 1).find(open) ?? steps.slice(0, Math.max(cur, 0)).find(open) ?? null
}

// A round is set index s across the group; rest only once every member that has a set s has
// done it. The length comes from the last member that HAS a set s: with A at 4 sets and B at 3,
// round 4 is A alone, and B's rest would describe a transition that round never makes.
export function roundRest(exercises: (SupersetRow & SetsRow)[], exIdx: number, setIdx: number): { rest: boolean; sourceExIdx: number } {
  const g = groupOf(exercises, exIdx)
  if (!g) return { rest: true, sourceExIdx: exIdx }
  let rest = true
  let sourceExIdx = exIdx
  for (let k = g.start; k <= g.end; k++) {
    const s = exercises[k].sets?.[setIdx]
    if (!s) continue
    sourceExIdx = k
    if (!s.completed) rest = false
  }
  return { rest, sourceExIdx }
}

type RoundRow = { sets?: { completed?: boolean; weight?: number | null; reps?: number | null }[] }

export interface RoundRecapEntry {
  exIdx: number
  weight: number | null
  reps: number | null
  completed: boolean
}

// Rounds in a group: the longest member's set count (a round is set index s across the group).
export function totalRounds(rows: RoundRow[], start: number, end: number): number {
  let n = 0
  for (let k = start; k <= end; k++) n = Math.max(n, rows[k]?.sets?.length ?? 0)
  return n
}

// 0-based index of the round being worked: the first set index where some member that has that
// set has not completed it. When every round is done it is totalRounds (one past the last), so
// a caller shows Math.min(index + 1, total).
export function currentRound(rows: RoundRow[], start: number, end: number): number {
  const total = totalRounds(rows, start, end)
  for (let s = 0; s < total; s++) {
    for (let k = start; k <= end; k++) {
      const set = rows[k]?.sets?.[s]
      if (set && !set.completed) return s
    }
  }
  return total
}

// What each member did (or will do) in one round, in list order; members with no such set are skipped.
export function roundRecap(rows: RoundRow[], g: { start: number; end: number }, roundIdx: number): RoundRecapEntry[] {
  const out: RoundRecapEntry[] = []
  for (let k = g.start; k <= g.end; k++) {
    const s = rows[k]?.sets?.[roundIdx]
    if (s) out.push({ exIdx: k, weight: s.weight ?? null, reps: s.reps ?? null, completed: !!s.completed })
  }
  return out
}

// Which group (0 = first in the list, 1 = second, ...) row i belongs to, for colour cycling;
// -1 when i is not in a superset. Matches the letter order groupOf gives.
export function groupColorIndex(rows: SupersetRow[], i: number): number {
  return runs(rows).findIndex((r) => r.start <= i && i <= r.end)
}

// Moves row j to directly after row i and links it to i. Adjacent rows (either side) are only
// linked, not reordered; rows already in one group are returned unchanged. Normalised.
export function pairWith<T extends SupersetRow>(input: T[], i: number, j: number): T[] {
  if (i === j || i < 0 || j < 0 || i >= input.length || j >= input.length) return input
  const rows = normaliseSupersets(input)
  const gi = rows[i].superset_group ?? null
  if (gi !== null && gi === (rows[j].superset_group ?? null)) return rows
  if (j === i + 1) return linkWithNext(rows, i)
  if (j === i - 1) return linkWithNext(rows, j)
  // Cleared first: a stale label must not re-join j to former group mates it lands beside.
  const moved = { ...rows[j], superset_group: null } as T
  const rest = rows.filter((_, k) => k !== j)
  const at = (j < i ? i - 1 : i) + 1
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)]
  const anchor = j < i ? i - 1 : i
  if (gi !== null) {
    return normaliseSupersets(next.map((r, k) => (k === at ? { ...r, superset_group: gi } : r)))
  }
  return linkWithNext(next, anchor)
}
