import { greeting, muscleHex, muscleRoast, nextStartableDay } from './dashboard'
import type { Program } from '../types'

describe('muscleHex', () => {
  it('resolves case-insensitively', () => {
    expect(muscleHex('Chest')).toBe('#f87171')
    expect(muscleHex('LEGS')).toBe('#34d399')
  })

  it('falls back to indigo for an unknown muscle', () => {
    expect(muscleHex('zzz')).toBe('#6366f1')
    expect(muscleHex('')).toBe('#6366f1')
  })
})

describe('muscleRoast', () => {
  it('has copy for every muscle the colour table knows', () => {
    // The two tables are read together on the dashboard; a muscle with a colour but
    // no line renders a coloured slice next to the generic fallback text.
    for (const m of ['chest', 'back', 'legs', 'core', 'full body']) {
      expect(muscleRoast(m)).not.toMatch(/Mysterious/)
    }
  })

  it('falls back for an unknown muscle', () => {
    expect(muscleRoast('zzz')).toMatch(/Mysterious/)
  })
})

describe('nextStartableDay', () => {
  // `todaysDay` indexes program.days by current_day_index — the server's "next
  // workout day after the last logged one" — so the fixtures must carry it.
  const prog = (id: number, currentDayIndex: number, days: Partial<Program['days'][number]>[]): Program =>
    ({
      id, name: `P${id}`, current_day_index: currentDayIndex,
      days: days.map((d, i) => ({ id: id * 10 + i, order_index: i, is_rest_day: false, name: '', exercises: [], ...d })),
    } as Program)

  const withExercises = { exercises: [{ id: 1 }] as never }

  it('returns null when nothing is startable', () => {
    expect(nextStartableDay([])).toBeNull()
    // A rest day and an empty workout day are both unstartable.
    expect(nextStartableDay([prog(1, 0, [{ is_rest_day: true }])])).toBeNull()
    expect(nextStartableDay([prog(2, 0, [{ exercises: [] }])])).toBeNull()
  })

  it('skips a program whose due day is a rest day', () => {
    const resting = prog(1, 1, [withExercises, { is_rest_day: true }])
    const ready = prog(2, 0, [withExercises])
    expect(nextStartableDay([resting, ready])?.program.id).toBe(2)
  })

  it('picks the first program that has a startable day today', () => {
    const empty = prog(1, 0, [{ exercises: [] }])
    const ready = prog(2, 0, [withExercises])
    expect(nextStartableDay([empty, ready])?.program.id).toBe(2)
  })

  it('scans programs in order, so an earlier one wins a tie', () => {
    const a = prog(1, 0, [withExercises])
    const b = prog(2, 0, [withExercises])
    expect(nextStartableDay([a, b])?.program.id).toBe(1)
  })

  it('returns the due day itself, not just the program', () => {
    const p = prog(1, 1, [{ exercises: [] }, withExercises])
    expect(nextStartableDay([p])?.day.id).toBe(11)
  })
})

describe('greeting', () => {
  const at = (h: number) => new Date(2026, 0, 15, h, 30)

  it('splits the day at noon and 5pm', () => {
    expect(greeting(at(0))).toBe('Good morning')
    expect(greeting(at(11))).toBe('Good morning')
    expect(greeting(at(12))).toBe('Good afternoon')
    expect(greeting(at(16))).toBe('Good afternoon')
    expect(greeting(at(17))).toBe('Good evening')
    expect(greeting(at(23))).toBe('Good evening')
  })

  it('reads the time it is given, not the clock', () => {
    // Taking `now` as an argument is what lets the caller sample it per mount; web
    // previously read a module-load constant, which went stale across midnight.
    expect(greeting(at(9))).toBe('Good morning')
    expect(greeting(at(21))).toBe('Good evening')
  })
})
