import { moveItem, occurrenceKeys, remapIndex } from './reorder'

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('moves an item down', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up', () => {
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves first to last and last to first', () => {
    expect(moveItem(list, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('does not mutate the input', () => {
    const copy = list.slice()
    moveItem(list, 0, 3)
    expect(list).toEqual(copy)
  })

  it('returns the same list for a no-op or out-of-range move', () => {
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, -1, 0)).toBe(list)
    expect(moveItem(list, 0, 4)).toBe(list)
    expect(moveItem(['only'], 0, 1)).toEqual(['only'])
    expect(moveItem([], 0, 0)).toEqual([])
  })

  it('carries the item object itself, so nested sets travel with it', () => {
    const ex = [{ id: 1, sets: [{ completed: true }] }, { id: 2, sets: [] }]
    const moved = moveItem(ex, 0, 1)
    expect(moved[1]).toBe(ex[0])
  })
})

describe('remapIndex', () => {
  // Every index must land where moveItem actually put its item.
  it.each([
    [0, 2], [2, 0], [0, 3], [3, 0], [1, 2], [2, 1],
  ])('agrees with moveItem for a move from %i to %i', (from, to) => {
    const list = ['a', 'b', 'c', 'd']
    const moved = moveItem(list, from, to)
    list.forEach((item, i) => expect(moved[remapIndex(i, from, to)]).toBe(item))
  })
})

describe('occurrenceKeys', () => {
  it('keys unique ids by the id', () => {
    expect(occurrenceKeys([7, 3])).toEqual(['7:0', '3:0'])
  })

  it('tells a repeated exercise apart', () => {
    expect(occurrenceKeys([7, 3, 7])).toEqual(['7:0', '3:0', '7:1'])
  })

  it('keeps a key with its exercise across a reorder', () => {
    const ids = [7, 3, 5]
    const before = occurrenceKeys(ids)
    const after = occurrenceKeys(moveItem(ids, 0, 2))
    expect(after).toEqual([before[1], before[2], before[0]])
  })
})
