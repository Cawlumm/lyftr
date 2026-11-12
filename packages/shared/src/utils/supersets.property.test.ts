// Randomized invariants for the superset helpers, over un-normalised labels, zero-set members
// and repeated exercises. Seeded, so a failure reproduces.
import {
  normaliseSupersets, linkWithNext, unlinkFromNext, pairWith, groupOf, isLinkedToNext,
  supersetSteps, nextSupersetTarget, roundRest, totalRounds, currentRound, groupColorIndex,
} from './supersets'

type Row = { id: number; superset_group: number | null | undefined; sets: { completed: boolean }[] }

let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const int = (n: number) => Math.floor(rnd() * n)

function randomRows(): Row[] {
  const n = int(9)
  return Array.from({ length: n }, (_, id) => ({
    id,
    superset_group: [null, undefined, 1, 2, 3, 7][int(6)] as number | null | undefined,
    sets: Array.from({ length: int(6) }, () => ({ completed: rnd() < 0.4 })),
  }))
}

// What "normalised" means: every non-null label is one run of 2+ rows, labelled 1..n in order.
function assertNormalised(rows: Row[], ctx: string) {
  let expect_ = 0
  let i = 0
  while (i < rows.length) {
    const g = rows[i].superset_group ?? null
    if (g === null) { i++; continue }
    let j = i
    while (j + 1 < rows.length && (rows[j + 1].superset_group ?? null) === g) j++
    if (j === i) throw new Error(`${ctx}: singleton group ${g} at ${i} in ${JSON.stringify(rows.map(r => r.superset_group))}`)
    expect_++
    if (g !== expect_) throw new Error(`${ctx}: label ${g} where ${expect_} expected in ${JSON.stringify(rows.map(r => r.superset_group))}`)
    i = j + 1
  }
}
const ids = (rows: Row[]) => rows.map(r => r.id).sort((a, b) => a - b).join(',')

const N = 5000

describe('superset invariants under random input', () => {
  it('normalise is idempotent, keeps row order, and always yields a valid labelling', () => {
    for (let t = 0; t < N; t++) {
      const rows = randomRows()
      const a = normaliseSupersets(rows)
      assertNormalised(a, 'normalise')
      expect(a.map(r => r.id)).toEqual(rows.map(r => r.id))
      expect(normaliseSupersets(a)).toBe(a)
    }
  })

  it('link / unlink / pairWith keep every row once and stay normalised', () => {
    for (let t = 0; t < N; t++) {
      // Every writer normalises, so the editors only ever hand these normalised rows.
      const rows = normaliseSupersets(randomRows())
      if (!rows.length) continue
      const i = int(rows.length), j = int(rows.length)
      const linked = linkWithNext(rows, i)
      assertNormalised(linked, `link(${i})`)
      expect(ids(linked)).toBe(ids(rows))
      if (i + 1 < rows.length) expect(isLinkedToNext(linked, i)).toBe(true)

      const unlinked = unlinkFromNext(linked, i)
      assertNormalised(unlinked, `unlink(${i})`)
      expect(isLinkedToNext(unlinked, i)).toBe(false)
      expect(ids(unlinked)).toBe(ids(rows))

      const paired = pairWith(rows, i, j)
      assertNormalised(paired, `pairWith(${i},${j})`)
      expect(ids(paired)).toBe(ids(rows))
      const together = (rows[i].superset_group ?? null) !== null && rows[i].superset_group === rows[j].superset_group
      if (i !== j && !together) {
        const pi = paired.findIndex(r => r.id === rows[i].id)
        const pj = paired.findIndex(r => r.id === rows[j].id)
        if (Math.abs(pi - pj) !== 1) throw new Error(`pairWith(${i},${j}) on ${JSON.stringify(rows.map(r => r.superset_group))} -> ${JSON.stringify(paired.map(r => [r.id, r.superset_group]))}`)
        expect(paired[pi].superset_group ?? null).not.toBeNull()
        expect(paired[pi].superset_group).toBe(paired[pj].superset_group)
      }
    }
  })

  it('a group\'s steps visit every set exactly once, and the advance never lands on a done set', () => {
    for (let t = 0; t < N; t++) {
      const rows = normaliseSupersets(randomRows())
      for (let k = 0; k < rows.length; k++) {
        const g = groupOf(rows, k)
        if (!g) continue
        const steps = supersetSteps(rows, g.start, g.end)
        const expected = rows.slice(g.start, g.end + 1).reduce((n, r) => n + r.sets.length, 0)
        expect(steps).toHaveLength(expected)
        expect(new Set(steps.map(s => `${s.exIdx}:${s.setIdx}`)).size).toBe(expected)
        expect(totalRounds(rows, g.start, g.end)).toBe(Math.max(0, ...rows.slice(g.start, g.end + 1).map(r => r.sets.length)))
        const cr = currentRound(rows, g.start, g.end)
        expect(cr).toBeGreaterThanOrEqual(0)
        for (const s of [-1, ...steps.map(x => x.setIdx)]) {
          const next = nextSupersetTarget(rows, k, s)
          if (next) {
            expect(next.exIdx).toBeGreaterThanOrEqual(g.start)
            expect(next.exIdx).toBeLessThanOrEqual(g.end)
            expect(rows[next.exIdx].sets[next.setIdx]?.completed).toBe(false)
          } else {
            // "After this step": the step asked about is excluded, so null means nothing else is open.
            const open = steps.filter(st => !rows[st.exIdx].sets[st.setIdx].completed && !(st.exIdx === k && st.setIdx === s))
            expect(open).toEqual([])
          }
        }
        for (let s = 0; s < totalRounds(rows, g.start, g.end); s++) {
          const { rest, sourceExIdx } = roundRest(rows, k, s)
          const members = rows.slice(g.start, g.end + 1).map((r, o) => ({ r, o: o + g.start })).filter(({ r }) => r.sets[s])
          expect(rest).toBe(members.every(({ r }) => r.sets[s].completed))
          if (members.length) expect(sourceExIdx).toBe(members[members.length - 1].o)
        }
      }
    }
  })

})
