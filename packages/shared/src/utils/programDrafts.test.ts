import { appendDay, moveDayBy, patchDayAt, reindexDays, removeDayAt } from './programDrafts'

type Day = { id?: number; order_index: number; is_rest_day: boolean; name: string; exercises: unknown[] }
const day = (name: string, over: Partial<Day> = {}): Day =>
  ({ order_index: 0, is_rest_day: false, name, exercises: [], ...over })

describe('reindexDays', () => {
  it('rewrites order_index to match array position', () => {
    const out = reindexDays([day('a', { order_index: 7 }), day('b', { order_index: 3 })])
    expect(out.map((d) => d.order_index)).toEqual([0, 1])
  })

  it('does not mutate the input', () => {
    const input = [day('a', { order_index: 9 })]
    reindexDays(input)
    expect(input[0].order_index).toBe(9)
  })
})

describe('appendDay', () => {
  it('adds an empty workout day at the end', () => {
    const out = appendDay([day('a')], false)
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ order_index: 1, is_rest_day: false, name: '', exercises: [] })
  })

  it('adds a rest day when asked', () => {
    expect(appendDay([] as Day[], true)[0].is_rest_day).toBe(true)
  })
})

describe('removeDayAt', () => {
  it('drops the day and closes the gap in order_index', () => {
    const out = removeDayAt([day('a'), day('b'), day('c')], 1)
    expect(out.map((d) => d.name)).toEqual(['a', 'c'])
    expect(out.map((d) => d.order_index)).toEqual([0, 1])
  })

  it('preserves the server-side id of the days that remain', () => {
    // Days are matched by id on update; losing one would re-attribute logged workouts.
    const out = removeDayAt([day('a', { id: 10 }), day('b', { id: 11 })], 0)
    expect(out[0].id).toBe(11)
  })
})

describe('moveDayBy', () => {
  it('swaps with the neighbour and reindexes', () => {
    const out = moveDayBy([day('a'), day('b'), day('c')], 0, 1)
    expect(out.map((d) => d.name)).toEqual(['b', 'a', 'c'])
    expect(out.map((d) => d.order_index)).toEqual([0, 1, 2])
  })

  it('returns the SAME array reference when the move falls off either end', () => {
    // Identity is the signal the caller uses to skip its expanded-row bookkeeping.
    const days = [day('a'), day('b')]
    expect(moveDayBy(days, 0, -1)).toBe(days)
    expect(moveDayBy(days, 1, 1)).toBe(days)
  })
})

describe('patchDayAt', () => {
  it('merges the patch into one day only', () => {
    const out = patchDayAt([day('a'), day('b')], 1, { name: 'renamed' })
    expect(out[1].name).toBe('renamed')
    expect(out[0].name).toBe('a')
  })

  it('leaves order_index alone — patching is not reordering', () => {
    const out = patchDayAt([day('a'), day('b', { order_index: 1 })], 1, { is_rest_day: true })
    expect(out[1].order_index).toBe(1)
    expect(out[1].is_rest_day).toBe(true)
  })
})
