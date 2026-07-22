import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Program, ProgramDay } from '@lyftr/shared'

// expo-router can't load under bare jest (see jest.config.js note — route files are
// never collected for the same reason); the sheet's import chain reaches it via the
// ui barrel → useTheme → lib/lyftr, so stub just the router surface lib/lyftr touches.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
// Sheet reads useSafeAreaInsets; there's no provider under test — zeroed insets.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { DayPickerSheet, pickProgramDay } from './DayPickerSheet'

const day = (overrides: Partial<ProgramDay> = {}): ProgramDay => ({
  id: 1,
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const program = (days: ProgramDay[], currentDayIndex = 0): Program => ({
  id: 1,
  name: 'PPL',
  created_at: '2026-01-01T00:00:00Z',
  days,
  current_day_index: currentDayIndex,
})

describe('pickProgramDay', () => {
  it('zero workout days → onEmpty, never the sheet or a selection', () => {
    const onSelect = jest.fn()
    const openSheet = jest.fn()
    const onEmpty = jest.fn()
    pickProgramDay(program([day({ is_rest_day: true })]), onSelect, openSheet, onEmpty)
    expect(onEmpty).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(openSheet).not.toHaveBeenCalled()
  })

  it('exactly one workout day resolves immediately (one-tap flow preserved)', () => {
    const onSelect = jest.fn()
    const openSheet = jest.fn()
    const only = day({ id: 5, order_index: 1 })
    const p = program([day({ id: 4, order_index: 0, is_rest_day: true }), only])
    pickProgramDay(p, onSelect, openSheet)
    expect(onSelect).toHaveBeenCalledWith(p, only)
    expect(openSheet).not.toHaveBeenCalled()
  })

  it('multiple workout days defer to the sheet', () => {
    const onSelect = jest.fn()
    const openSheet = jest.fn()
    const p = program([day({ id: 1 }), day({ id: 2, order_index: 1 })])
    pickProgramDay(p, onSelect, openSheet)
    expect(openSheet).toHaveBeenCalledWith(p)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('DayPickerSheet', () => {
  const days = [
    day({ id: 1, order_index: 0, name: 'Push' }),
    day({ id: 2, order_index: 1, is_rest_day: true }),
    day({ id: 3, order_index: 2 }), // unnamed → label from its cycle position
  ]

  it('renders nothing when program is null', () => {
    render(<DayPickerSheet program={null} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Pick a Day')).toBeNull()
  })

  it('lists only workout days, labeled by cycle position (not filtered index)', () => {
    render(<DayPickerSheet program={program(days)} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Push')).toBeTruthy()
    // The unnamed day sits at cycle position 2 → "Day 3", NOT "Day 2" (the
    // rest-filtered loop index) — regression guard for the dayLabel(day, i) bug.
    expect(screen.getByText('Day 3')).toBeTruthy()
    expect(screen.queryByText('Rest Day')).toBeNull()
  })

  it('marks the due day with a TODAY chip', () => {
    render(<DayPickerSheet program={program(days, 2)} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('TODAY')).toBeTruthy()
  })

  it('selecting a day fires onSelect with the program and that day', () => {
    const onSelect = jest.fn()
    const p = program(days)
    render(<DayPickerSheet program={p} onSelect={onSelect} onClose={() => {}} />)
    fireEvent.press(screen.getByText('Push'))
    expect(onSelect).toHaveBeenCalledWith(p, days[0])
  })
})
