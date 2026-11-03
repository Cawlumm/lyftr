import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { i18n } from '@lyftr/shared'
import type { Program, ProgramDay } from '@lyftr/shared'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}))

import { client } from '../../lib/lyftr'
import { ProgramPicker } from './ProgramPicker'

// Ported from web/src/components/ProgramPicker.test.tsx. Not carried over: the web "back
// to programs" text link - on mobile the header close button steps back from the day list.
const day = (overrides: Partial<ProgramDay> = {}): ProgramDay => ({
  id: 1,
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const program = (days: ProgramDay[], overrides: Partial<Program> = {}): Program => ({
  id: 1,
  name: 'PPL',
  created_at: '2026-01-01T00:00:00Z',
  days,
  current_day_index: 0,
  ...overrides,
})

// [Push, Rest, unnamed] - current_day_index 2 points at the unnamed day.
const multiDay = () =>
  program(
    [
      day({ id: 1, order_index: 0, name: 'Push' }),
      day({ id: 2, order_index: 1, is_rest_day: true }),
      day({ id: 3, order_index: 2 }),
    ],
    { current_day_index: 2 },
  )

const open = async (programs: Program[], onSelect = jest.fn()) => {
  jest.spyOn(client.programAPI, 'list').mockResolvedValue(programs)
  await render(<ProgramPicker onSelect={onSelect} onClose={jest.fn()} />)
  return onSelect
}

afterEach(async () => {
  jest.restoreAllMocks()
  await i18n.changeLanguage('en')
})

describe('ProgramPicker (mobile)', () => {
  it('reads its copy from the catalog in Spanish', async () => {
    await i18n.changeLanguage('es')
    await open([multiDay()])
    expect(screen.getByText('Cargar desde un programa')).toBeTruthy()
    await fireEvent.press(await screen.findByText('PPL'))
    expect(screen.getByText('Elige un día para rellenar los ejercicios')).toBeTruthy()
    expect(screen.getByText('HOY')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar selector de programas' })).toBeTruthy()
  })

  it('a program with zero workout days renders disabled (nothing to load)', async () => {
    const onSelect = await open([program([day({ is_rest_day: true })])])
    const row = await screen.findByRole('button', { name: /PPL/ })
    expect(row.props.accessibilityState?.disabled ?? row.props['aria-disabled']).toBe(true)
    expect(screen.getByText('No exercises yet')).toBeTruthy()
    await fireEvent.press(row)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a single-workout-day program selects immediately (one-tap flow preserved)', async () => {
    const only = day({ id: 5, order_index: 1 })
    const p = program([day({ id: 4, order_index: 0, is_rest_day: true }), only])
    const onSelect = await open([p])
    await fireEvent.press(await screen.findByText('PPL'))
    expect(onSelect).toHaveBeenCalledWith(p, only)
  })

  it('a multi-workout-day program opens the day step listing only workout days, labeled by cycle position', async () => {
    await open([multiDay()])
    await fireEvent.press(await screen.findByText('PPL'))
    expect(screen.getByText('Pick a day to pre-fill exercises')).toBeTruthy()
    expect(screen.getByText('Push')).toBeTruthy()
    // The unnamed day sits at cycle position 2 -> "Day 3", NOT "Day 2" (the
    // rest-filtered loop index) - regression guard for the dayLabel(day, i) bug.
    expect(screen.getByText('Day 3')).toBeTruthy()
    expect(screen.queryByText('Rest Day')).toBeNull()
  })

  it('marks the due day with a TODAY chip in the day step', async () => {
    await open([multiDay()])
    await fireEvent.press(await screen.findByText('PPL'))
    // The chip sits inside the due day's row (the unnamed "Day 3"), not Push's.
    const due = screen.getByRole('button', { name: /Day 3/ })
    expect(within(due).getByText('TODAY')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Push/ })).queryByText('TODAY')).toBeNull()
  })

  it('picking a day fires onSelect with the program and that day', async () => {
    const p = multiDay()
    const onSelect = await open([p])
    await fireEvent.press(await screen.findByText('PPL'))
    await fireEvent.press(screen.getByText('Push'))
    expect(onSelect).toHaveBeenCalledWith(p, p.days![0])
  })

  it('the close button steps back from the day list to the program list', async () => {
    await open([multiDay()])
    await fireEvent.press(await screen.findByText('PPL'))
    await fireEvent.press(screen.getByRole('button', { name: 'Close program picker' }))
    expect(screen.getByText('Load from Program')).toBeTruthy()
    expect(screen.queryByText('Pick a day to pre-fill exercises')).toBeNull()
  })

  it('filters the program list by name and says so when nothing matches', async () => {
    await open([multiDay(), program([day()], { id: 2, name: 'Upper Lower' })])
    await screen.findByText('PPL')
    await fireEvent.changeText(screen.getByPlaceholderText('Search programs…'), 'upper')
    expect(screen.queryByText('PPL')).toBeNull()
    expect(screen.getByText('Upper Lower')).toBeTruthy()
    await fireEvent.changeText(screen.getByPlaceholderText('Search programs…'), 'zzz')
    expect(screen.getByText('No matching programs')).toBeTruthy()
  })
})
