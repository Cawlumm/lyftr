import {
  activeFilterCount, activeFilters, emptyFilters, parseFilters, setFilter,
  type FilterGroup,
} from './filters'

const groups: FilterGroup[] = [
  { key: 'muscle', label: 'Muscle', options: [{ value: 'chest', label: 'Chest' }, { value: 'lats', label: 'Lats' }] },
  { key: 'equipment', label: 'Equipment', options: [{ value: 'barbell', label: 'Barbell' }] },
]

describe('filters', () => {
  it('starts with every group on any', () => {
    expect(emptyFilters(groups)).toEqual({ muscle: null, equipment: null })
  })

  it('sets one group and leaves the others', () => {
    const chest = setFilter(emptyFilters(groups), 'muscle', 'chest')
    expect(chest).toEqual({ muscle: 'chest', equipment: null })
    expect(setFilter(chest, 'muscle', 'lats').muscle).toBe('lats')
    expect(setFilter(chest, 'muscle', null).muscle).toBeNull()
  })

  it('does not mutate what it was given', () => {
    const start = emptyFilters(groups)
    setFilter(start, 'equipment', 'barbell')
    expect(start).toEqual({ muscle: null, equipment: null })
  })

  it('lists active filters in group order with their labels', () => {
    const values = { equipment: 'barbell', muscle: 'lats' }
    expect(activeFilters(groups, values)).toEqual([
      { key: 'muscle', value: 'lats', label: 'Lats', groupLabel: 'Muscle' },
      { key: 'equipment', value: 'barbell', label: 'Barbell', groupLabel: 'Equipment' },
    ])
    expect(activeFilterCount(groups, values)).toBe(2)
  })

  it('does not count a value no option offers', () => {
    expect(activeFilters(groups, { muscle: 'bogus', equipment: null })).toEqual([])
    expect(activeFilterCount(groups, emptyFilters(groups))).toBe(0)
  })

  it('parses values from a reader and drops anything not offered', () => {
    const params = new URLSearchParams('muscle=chest&equipment=kettle')
    expect(parseFilters(groups, (k) => params.get(k))).toEqual({ muscle: 'chest', equipment: null })
    expect(parseFilters(groups, () => undefined)).toEqual({ muscle: null, equipment: null })
  })

  it('is case-sensitive, because the API values are slugs', () => {
    expect(parseFilters(groups, (k) => (k === 'muscle' ? 'Chest' : null)).muscle).toBeNull()
  })
})
