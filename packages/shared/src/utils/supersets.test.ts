import fixtures from './supersets.fixtures.json'
import {
  groupOf, isLinkedToNext, linkWithNext, nextSupersetTarget, normaliseSupersets, roundRest, supersetSteps, unlinkFromNext,
} from './supersets'

type Row = { id: string; superset_group?: number | null; sets: { completed?: boolean }[] }
const row = (id: string, superset_group: number | null | undefined, sets: (boolean | undefined)[] = [false, false, false]): Row => ({
  id, superset_group, sets: sets.map((completed) => ({ completed })),
})
const groups = (rows: { superset_group?: number | null }[]) => rows.map((r) => r.superset_group ?? null)
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).join('')

describe('normaliseSupersets: shared fixtures', () => {
  it.each(fixtures.cases.map((c) => [c.name, c] as const))('%s', (_n, c) => {
    const rows = c.input.map((g, i) => row(String(i), g))
    const out = normaliseSupersets(rows)
    expect(groups(out)).toEqual(c.normalised)
    expect(ids(out)).toBe(ids(rows))
  })
})

describe('normaliseSupersets', () => {
  it('treats undefined as null and returns the same array when nothing changes', () => {
    const rows = [row('a', undefined), row('b', null)]
    expect(normaliseSupersets(rows)).toBe(rows)
  })
  it('does not mutate its input', () => {
    const rows = [row('a', 5), row('b', 5)]
    normaliseSupersets(rows)
    expect(groups(rows)).toEqual([5, 5])
  })
})

describe('link / unlink', () => {
  const plain = () => [row('a', null), row('b', null), row('c', null), row('d', null)]

  it('links two ungrouped neighbours', () => {
    const out = linkWithNext(plain(), 1)
    expect(groups(out)).toEqual([null, 1, 1, null])
    expect(isLinkedToNext(out, 1)).toBe(true)
    expect(isLinkedToNext(out, 0)).toBe(false)
  })
  it('grows an existing group on either side', () => {
    const pair = linkWithNext(plain(), 0)
    expect(groups(linkWithNext(pair, 1))).toEqual([1, 1, 1, null])
    expect(groups(linkWithNext(linkWithNext(plain(), 1), 0))).toEqual([1, 1, 1, null])
  })
  it('merges two adjacent groups', () => {
    const rows = linkWithNext(linkWithNext(plain(), 0), 2)
    expect(groups(rows)).toEqual([1, 1, 2, 2])
    expect(groups(linkWithNext(rows, 1))).toEqual([1, 1, 1, 1])
  })
  it('is a no-op when already linked or out of range', () => {
    const rows = linkWithNext(plain(), 0)
    expect(linkWithNext(rows, 0)).toBe(rows)
    expect(linkWithNext(rows, 3)).toBe(rows)
    expect(linkWithNext(rows, -1)).toBe(rows)
  })
  it('unlinking a pair dissolves both', () => {
    expect(groups(unlinkFromNext(linkWithNext(plain(), 0), 0))).toEqual([null, null, null, null])
  })
  it('unlinking inside a tri-set splits it, dissolving the singleton', () => {
    const tri = [row('a', 1), row('b', 1), row('c', 1)]
    expect(groups(unlinkFromNext(tri, 0))).toEqual([null, 1, 1])
    expect(groups(unlinkFromNext(tri, 1))).toEqual([1, 1, null])
  })
  it('unlinking a four-run into two pairs', () => {
    expect(groups(unlinkFromNext([row('a', 1), row('b', 1), row('c', 1), row('d', 1)], 1))).toEqual([1, 1, 2, 2])
  })
  it('unlinking an unlinked joint changes nothing', () => {
    const rows = plain()
    expect(unlinkFromNext(rows, 0)).toBe(rows)
  })
  it('never reorders rows', () => {
    expect(ids(linkWithNext(plain(), 2))).toBe('abcd')
    expect(ids(unlinkFromNext([row('a', 1), row('b', 1)], 0))).toBe('ab')
  })
})

describe('groupOf', () => {
  const rows = [row('a', null), row('b', 3), row('c', 3), row('d', null), row('e', 9), row('f', 9), row('g', 9)]
  it('gives start, end and a letter by group order', () => {
    expect(groupOf(rows, 1)).toEqual({ start: 1, end: 2, letter: 'A' })
    expect(groupOf(rows, 2)).toEqual({ start: 1, end: 2, letter: 'A' })
    expect(groupOf(rows, 5)).toEqual({ start: 4, end: 6, letter: 'B' })
  })
  it('is null outside a group, for singletons and out of range', () => {
    expect(groupOf(rows, 0)).toBeNull()
    expect(groupOf([row('a', 1)], 0)).toBeNull()
    expect(groupOf(rows, 99)).toBeNull()
  })
})

describe('supersetSteps', () => {
  const at = (r: { exIdx: number; setIdx: number }[]) => r.map((t) => `${'ABC'[t.exIdx]}${t.setIdx + 1}`).join(' ')
  it('2 x 3 goes round by round', () => {
    expect(at(supersetSteps([row('a', 1), row('b', 1)], 0, 1))).toBe('A1 B1 A2 B2 A3 B3')
  })
  it('unequal 4/3 skips the member with no set', () => {
    const rows = [row('a', 1, [false, false, false, false]), row('b', 1)]
    expect(at(supersetSteps(rows, 0, 1))).toBe('A1 B1 A2 B2 A3 B3 A4')
  })
  it('three members', () => {
    const rows = [row('a', 1, [false, false]), row('b', 1, [false, false]), row('c', 1, [false, false])]
    expect(at(supersetSteps(rows, 0, 2))).toBe('A1 B1 C1 A2 B2 C2')
  })
  it('a member with zero sets contributes no steps', () => {
    const rows = [row('a', 1, [false, false]), row('b', 1, [])]
    expect(at(supersetSteps(rows, 0, 1))).toBe('A1 A2')
  })
})

describe('nextSupersetTarget', () => {
  it('alternates A1 -> B1 -> A2', () => {
    const rows = [row('a', 1), row('b', 1)]
    expect(nextSupersetTarget(rows, 0, 0)).toEqual({ exIdx: 1, setIdx: 0 })
    rows[0].sets[0].completed = true
    rows[1].sets[0].completed = true
    expect(nextSupersetTarget(rows, 1, 0)).toEqual({ exIdx: 0, setIdx: 1 })
  })
  it('skips a step already done (B ticked before A)', () => {
    const rows = [row('a', 1), row('b', 1, [true, false, false])]
    rows[0].sets[0].completed = true
    expect(nextSupersetTarget(rows, 0, 0)).toEqual({ exIdx: 0, setIdx: 1 })
  })
  it('wraps to a skipped earlier set', () => {
    const rows = [row('a', 1, [false, true, true]), row('b', 1, [true, true, true])]
    expect(nextSupersetTarget(rows, 1, 2)).toEqual({ exIdx: 0, setIdx: 0 })
  })
  it('is null when the group is done', () => {
    const rows = [row('a', 1, [true]), row('b', 1, [true])]
    expect(nextSupersetTarget(rows, 1, 0)).toBeNull()
  })
  it('handles unequal sets: after B3 comes A4', () => {
    const rows = [row('a', 1, [true, true, true, false]), row('b', 1, [true, true, true])]
    expect(nextSupersetTarget(rows, 1, 2)).toEqual({ exIdx: 0, setIdx: 3 })
  })
  it('setIdx -1 asks for the first open step of the group', () => {
    const rows = [row('a', 1, [true, false]), row('b', 1, [true, false])]
    expect(nextSupersetTarget(rows, 1, -1)).toEqual({ exIdx: 0, setIdx: 1 })
  })
  it('ungrouped rows fall back to the next incomplete set', () => {
    const rows = [row('a', null, [true, false, false])]
    expect(nextSupersetTarget(rows, 0, 0)).toEqual({ exIdx: 0, setIdx: 1 })
    expect(nextSupersetTarget([row('a', undefined, [true])], 0, 0)).toBeNull()
  })
  it('the same exercise twice in one group is addressed by row', () => {
    const rows = [row('a', 1, [true, false]), row('a', 1, [false, false])]
    expect(nextSupersetTarget(rows, 0, 0)).toEqual({ exIdx: 1, setIdx: 0 })
  })
  it('out-of-range row is null', () => {
    expect(nextSupersetTarget([], 0, 0)).toBeNull()
  })
})

describe('roundRest', () => {
  it('an ungrouped row rests with itself as source', () => {
    expect(roundRest([row('a', null)], 0, 0)).toEqual({ rest: true, sourceExIdx: 0 })
    expect(roundRest([row('a', undefined)], 0, 0)).toEqual({ rest: true, sourceExIdx: 0 })
  })
  it('no rest after A1, rest after B1 sourced from the last member', () => {
    const rows = [row('a', 1, [true, false]), row('b', 1, [false, false])]
    expect(roundRest(rows, 0, 0)).toEqual({ rest: false, sourceExIdx: 1 })
    rows[1].sets[0].completed = true
    expect(roundRest(rows, 1, 0)).toEqual({ rest: true, sourceExIdx: 1 })
  })
  it('B ticked before A: rest fires on A, the round-completing tick', () => {
    const rows = [row('a', 1, [false]), row('b', 1, [true])]
    expect(roundRest(rows, 1, 0).rest).toBe(false)
    rows[0].sets[0].completed = true
    expect(roundRest(rows, 0, 0)).toEqual({ rest: true, sourceExIdx: 1 })
  })
  it('a member without that set does not block the round', () => {
    const rows = [row('a', 1, [true, true, true, true]), row('b', 1, [true, true, true])]
    expect(roundRest(rows, 0, 3).rest).toBe(true)
  })
  it('takes the rest length from the last member that has the set, not the group end', () => {
    const rows = [row('a', 1, [true, true, true, false]), row('b', 1, [true, true, true])]
    rows[0].sets[3].completed = true
    expect(roundRest(rows, 0, 3)).toEqual({ rest: true, sourceExIdx: 0 })
  })
  it('a zero-set member does not block the round', () => {
    expect(roundRest([row('a', 1, [true]), row('b', 1, [])], 0, 0).rest).toBe(true)
  })
})
