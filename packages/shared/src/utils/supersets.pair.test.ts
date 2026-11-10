import { currentRound, groupColorIndex, pairWith, roundRecap, totalRounds } from './supersets'

type R = { n: string; superset_group?: number | null; sets: { completed?: boolean; weight?: number; reps?: number }[] }
const done = { completed: true, weight: 100, reps: 5 }
const todo = { completed: false, weight: 100, reps: 5 }
const row = (n: string, g: number | null, sets: R['sets'] = [todo]): R => ({ n, superset_group: g, sets })
const names = (rs: R[]) => rs.map((r) => `${r.n}${r.superset_group ?? '-'}`).join(' ')

describe('rounds', () => {
  const rows = [row('A', 1, [done, done, todo]), row('B', 1, [done, todo, todo]), row('C', null)]
  it('totals the longest member', () => {
    expect(totalRounds(rows, 0, 1)).toBe(3)
    expect(totalRounds([row('A', 1, [todo, todo, todo, todo]), row('B', 1, [todo])], 0, 1)).toBe(4)
  })
  it('current round is the first set index with an open member', () => {
    expect(currentRound(rows, 0, 1)).toBe(1)
    expect(currentRound([row('A', 1, [done]), row('B', 1, [todo])], 0, 1)).toBe(0)
  })
  it('is the total when everything is done, and skips members without that set', () => {
    expect(currentRound([row('A', 1, [done, done]), row('B', 1, [done])], 0, 1)).toBe(2)
    expect(currentRound([row('A', 1, [done, todo]), row('B', 1, [done])], 0, 1)).toBe(1)
  })
  it('recaps one round', () => {
    expect(roundRecap(rows, { start: 0, end: 1 }, 1)).toEqual([
      { exIdx: 0, weight: 100, reps: 5, completed: true },
      { exIdx: 1, weight: 100, reps: 5, completed: false },
    ])
    expect(roundRecap([row('A', 1, [todo, todo]), row('B', 1, [todo])], { start: 0, end: 1 }, 1).map((e) => e.exIdx)).toEqual([0])
  })
})

describe('groupColorIndex', () => {
  const rows = [row('A', 1), row('B', 1), row('C', null), row('D', 2), row('E', 2)]
  it('counts groups in list order', () => {
    expect([0, 1, 2, 3, 4].map((i) => groupColorIndex(rows, i))).toEqual([0, 0, -1, 1, 1])
  })
})

describe('pairWith', () => {
  const plain = () => [row('A', null), row('B', null), row('C', null), row('D', null)]
  it('links an adjacent row without moving', () => {
    expect(names(pairWith(plain(), 0, 1))).toBe('A1 B1 C- D-')
    expect(names(pairWith(plain(), 2, 1))).toBe('A- B1 C1 D-')
  })
  it('moves a later row next to i', () => {
    expect(names(pairWith(plain(), 0, 3))).toBe('A1 D1 B- C-')
  })
  it('moves an earlier row to just after i', () => {
    expect(names(pairWith(plain(), 2, 0))).toBe('B- C1 A1 D-')
  })
  it('joins the existing group when i is in one, mid-group included', () => {
    const rows = [row('A', 1), row('B', 1), row('C', null), row('D', null)]
    expect(names(pairWith(rows, 1, 3))).toBe('A1 B1 D1 C-')
    expect(names(pairWith(rows, 0, 3))).toBe('A1 D1 B1 C-')
  })
  it('does not drag former group mates along, and dissolves a left-over single', () => {
    const rows = [row('A', null), row('B', 1), row('C', 1), row('D', null)]
    expect(names(pairWith(rows, 0, 2))).toBe('A1 C1 B- D-')
  })
  it('returns the input for no-ops', () => {
    const rows = plain()
    expect(pairWith(rows, 1, 1)).toBe(rows)
    expect(pairWith(rows, 0, 9)).toBe(rows)
  })
})
