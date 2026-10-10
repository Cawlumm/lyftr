import { greeting, lifterQuip, muscleHex, muscleRoast, nextStartableDay } from './dashboard'
import type { Program } from '../types'
import { i18n } from '../i18n'
import es from '../i18n/locales/es.json'

// Tests that switch language restore English, so no other test sees Spanish.
afterEach(() => i18n.changeLanguage('en'))

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

  it('keeps the English lines exactly as they were', () => {
    expect(muscleRoast('Chest')).toBe('All chest, no legs. Classic bro.')
    expect(muscleRoast('shoulders')).toBe("Can't fit through doorways. Good.")
    expect(muscleRoast('full body')).toBe('A true all-rounder. Or you just did burpees.')
  })

  it('reads the catalog when called, so es gets the Spanish line', async () => {
    await i18n.changeLanguage('es')
    expect(muscleRoast('chest')).toBe(es.home.muscleRoast.chest)
    expect(muscleRoast('zzz')).toBe(es.home.muscleRoast.fallback)
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
    expect(greeting(at(0), 'Sam')).toBe('Good morning, Sam')
    expect(greeting(at(11), 'Sam')).toBe('Good morning, Sam')
    expect(greeting(at(12), 'Sam')).toBe('Good afternoon, Sam')
    expect(greeting(at(16), 'Sam')).toBe('Good afternoon, Sam')
    expect(greeting(at(17), 'Sam')).toBe('Good evening, Sam')
    expect(greeting(at(23), 'Sam')).toBe('Good evening, Sam')
  })

  it('reads the time it is given, not the clock', () => {
    // Taking `now` as an argument is what lets the caller sample it per mount; web
    // previously read a module-load constant, which went stale across midnight.
    expect(greeting(at(9), 'Sam')).toBe('Good morning, Sam')
    expect(greeting(at(21), 'Sam')).toBe('Good evening, Sam')
  })

  it('says "there" in English when there is no name', () => {
    // useDisplayName hands the common.there word to a nameless account; the sentence stays
    // what it always read.
    expect(greeting(at(9), 'there')).toBe('Good morning, there')
    expect(greeting(at(9))).toBe('Good morning, there')
  })

  it('in es puts the name in the sentence, and drops it when there is none', async () => {
    await i18n.changeLanguage('es')
    expect(greeting(at(9), 'Sam')).toBe('Buenos días, Sam')
    expect(greeting(at(14), 'Sam')).toBe('Buenas tardes, Sam')
    // The nameless word is "usuario" in es; the greeting must not read "Buenos días, usuario".
    expect(greeting(at(9), es.common.there)).toBe(es.home.greeting.morning_anonymous)
    expect(greeting(at(21), es.common.there)).toBe(es.home.greeting.evening_anonymous)
  })
})
describe('lifterQuip', () => {
  // The whole point: the dashboard re-renders on every fetch and refresh, so the same
  // account on the same day has to keep answering the same line.
  it('is stable for an account and a day', () => {
    const first = lifterQuip(7, '2026-10-06')
    for (let i = 0; i < 50; i++) expect(lifterQuip(7, '2026-10-06')).toBe(first)
  })

  it('moves on when the day does', () => {
    const week = ['03', '04', '05', '06', '07', '08', '09']
      .map((d) => lifterQuip(7, `2026-10-${d}`))
    expect(new Set(week).size).toBeGreaterThan(1)
  })

  // Not keyed on the name: it arrives late from a settings fetch, so a line that moved
  // when it landed would flicker on every cold load.
  it('does not depend on what the person is called', () => {
    expect(lifterQuip(7, '2026-10-06')).toBe(lifterQuip(7, '2026-10-06'))
  })

  it('always answers with a line, whatever the account', () => {
    for (const id of ['', 0, 7, 'anonymous', '日本', 'x'.repeat(500)]) {
      const quip = lifterQuip(id, '2026-10-06')
      expect(typeof quip).toBe('string')
      expect(quip.length).toBeGreaterThan(0)
    }
  })

  // Reads the real clock rather than a passed day — the shape both dashboards call.
  it('needs only an account id', () => {
    expect(typeof lifterQuip(7)).toBe('string')
  })

  // The list as it was before the lines moved into the catalog. Selection is by index, so a
  // reordered or reworded key would silently change what a given person reads on a given day.
  const BEFORE = [
    'The bar does not care how you feel about it.',
    'Progressive overload: the only pyramid scheme that works.',
    'Nobody has ever regretted the warm-up.',
    'The hardest rep is the one that gets you off the couch.',
    'Form first. Ego lifts are for the parking lot.',
    'Legs are not optional. They are just unpopular.',
    'Chalk is not a personality. It helps, though.',
    'You cannot out-train a log you never fill in.',
    'Deload weeks count. Reluctantly.',
    'Mirror check later. Barbell now.',
    'Half reps, full lies.',
    'The only bad set is the one you talked yourself out of.',
    'Somewhere a squat rack is holding a coat. Not yours.',
    'Showing up is the part most people skip.',
    'Protein is not optional. Neither is sleep.',
    'Rest is part of the plan, not a gap in it.',
  ]
  const indexFor = (id: string | number, day: string) => {
    const key = `${day}:${id}`
    let sum = 0
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i)
    return sum % BEFORE.length
  }

  it('picks the same English line for the same account and day as before', () => {
    const seen = new Set<number>()
    for (const id of [1, 7, 42, 'abc', 9001]) {
      for (let d = 1; d <= 28; d++) {
        const day = `2026-10-${String(d).padStart(2, '0')}`
        expect(lifterQuip(id, day)).toBe(BEFORE[indexFor(id, day)])
        seen.add(indexFor(id, day))
      }
    }
    expect(seen.size).toBe(BEFORE.length) // every line was exercised
  })

  it('picks the same line in es, translated', async () => {
    await i18n.changeLanguage('es')
    const lines = Object.values(es.home.quip)
    expect(lifterQuip(7, '2026-10-06')).toBe(lines[indexFor(7, '2026-10-06')])
  })
})
