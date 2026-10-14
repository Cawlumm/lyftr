import { todayStr, daysAgoStr, dayToInstant, dayToLocalDate, instantToDay, entryDay, workoutDay, memberSince, withLoggedOn, formatDay, formatDate, formatInstant, relativeDayLabel, defaultWorkoutName, UNKNOWN_DAY, type DateFormatName } from './dateUtils'
import { i18n } from '../i18n'


describe('dayToInstant', () => {
  it('defaults to local noon, expressed in UTC', () => {
    expect(dayToInstant('2026-06-15')).toBe('2026-06-15T16:00:00.000Z')
  })

  it('round-trips through instantToDay', () => {
    expect(instantToDay(dayToInstant('2026-01-31'))).toBe('2026-01-31')
    expect(instantToDay(dayToInstant('2026-11-01'))).toBe('2026-11-01')
  })

  // The bug this replaced: `new Date('2026-06-15')` parses as UTC midnight, which is
  // the previous evening for anyone west of UTC, so the entry landed a day early.
  it('never lands on the previous day west of UTC', () => {
    expect(instantToDay(dayToInstant('2026-06-15'))).toBe('2026-06-15')
  })

  it('keeps the original time-of-day when moving an existing entry', () => {
    const original = new Date(2026, 5, 15, 18, 30, 0).toISOString()
    const moved = dayToInstant('2026-06-20', original)
    expect(instantToDay(moved)).toBe('2026-06-20')
    expect(new Date(moved).getHours()).toBe(18)
    expect(new Date(moved).getMinutes()).toBe(30)
  })

  it('falls back to noon when the previous timestamp is unusable', () => {
    expect(dayToInstant('2026-06-15', 'not-a-date')).toBe(dayToInstant('2026-06-15'))
  })
})

describe('todayStr', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('todayStr — the date a form prefills', () => {
  // The mobile New Workout screen seeded its date with
  // `new Date().toISOString().slice(0, 10)`, the UTC day. West of UTC those differ
  // for the last hours of every evening, so the form offered tomorrow and the entry
  // was saved there. Suites run under America/New_York (see jest.config / the web
  // test script), so 23:00 local is already tomorrow in UTC.
  const at = (iso: string, fn: () => string) => {
    const RealDate = Date
    // @ts-expect-error — narrow stub, only the no-arg constructor is used here
    globalThis.Date = class extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-expect-error — passthrough
        super(...(args.length ? args : [iso]))
      }
      static now() { return new RealDate(iso).getTime() }
    }
    try { return fn() } finally { globalThis.Date = RealDate }
  }

  it('returns the local day, not the UTC day, late in the evening', () => {
    // 2026-08-08T23:30 in New York is 2026-08-09T03:30Z.
    const local = at('2026-08-09T03:30:00.000Z', () => todayStr())
    expect(local).toBe('2026-08-08')
  })

  it('differs from the UTC slice the regression used', () => {
    const iso = '2026-08-09T03:30:00.000Z'
    const utcSlice = iso.slice(0, 10)
    const local = at(iso, () => todayStr())
    expect(utcSlice).toBe('2026-08-09')
    expect(local).not.toBe(utcSlice)
  })

  it('round-trips into an instant that stays on the same local day', () => {
    const local = at('2026-08-09T03:30:00.000Z', () => todayStr())
    expect(instantToDay(dayToInstant(local))).toBe(local)
  })
})

describe('entryDay — the server is the source of truth', () => {
  it('uses the stored day even when the device would derive another one', () => {
    // Filed on the 4th in New York (16:00Z). A device in Tokyo puts that instant on
    // the 5th. Before the day was stored, that re-derivation is what moved entries —
    // and on the edit screens it got saved back.
    expect(entryDay({ logged_on: '2026-08-04', logged_at: '2026-08-04T16:00:00.000Z' }))
      .toBe('2026-08-04')
  })

  it('falls back to the instant when the server sent no day', () => {
    // A response from a server older than the column. Suites run in America/New_York.
    expect(entryDay({ logged_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })

  it('treats an empty stored day as absent rather than as a day', () => {
    expect(entryDay({ logged_on: '', logged_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })
})

describe('workoutDay — recovered from the recorded offset', () => {
  it('applies the offset rather than the device zone', () => {
    // 16:00Z at -240 is noon on the 4th. Correct from any device, anywhere.
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z', tz_offset_minutes: -240 }))
      .toBe('2026-08-04')
  })

  it('keeps the day the workout happened on across the UTC boundary', () => {
    // 02:00Z on the 5th, logged at -240, was 22:00 on the 4th where it happened.
    expect(workoutDay({ started_at: '2026-08-05T02:00:00.000Z', tz_offset_minutes: -240 }))
      .toBe('2026-08-04')
  })

  it('handles a positive offset past midnight the other way', () => {
    // 16:00Z at +540 (Tokyo) is 01:00 on the 5th.
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z', tz_offset_minutes: 540 }))
      .toBe('2026-08-05')
  })

  it('supports a half-hour offset', () => {
    // Kathmandu, +5:45. 20:00Z on the 4th is 01:45 on the 5th.
    expect(workoutDay({ started_at: '2026-08-04T20:00:00.000Z', tz_offset_minutes: 345 }))
      .toBe('2026-08-05')
  })

  it('falls back to the device zone for a row written before the offset existed', () => {
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })

  it('does not throw on an unparseable instant', () => {
    expect(() => workoutDay({ started_at: 'nonsense', tz_offset_minutes: -240 })).not.toThrow()
  })
})

describe('dayToLocalDate', () => {
  it('returns the same calendar day it was given, in local time', () => {
    const d = dayToLocalDate('2026-07-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(1)
  })

  // The point of the helper. `new Date('2026-07-01T12:00:00')` is parsed as UTC by
  // pre-iOS 14.5 Safari, which lands on the 2nd anywhere east of UTC+12 — so a stored
  // day would render as the next day purely because of how it was parsed. Noon leaves
  // 12 hours of headroom on both sides of the date it names.
  it('sits at local noon, far from either midnight', () => {
    expect(dayToLocalDate('2026-07-01').getHours()).toBe(12)
  })

  it('round-trips through the day formatter', () => {
    for (const day of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) {
      expect(instantToDay(dayToLocalDate(day).toISOString())).toBe(day)
    }
  })
})

// An unreadable instant used to become the string "NaN-NaN-NaN", which is not obviously
// wrong to anything downstream: it groups, it sorts, and it compares unequal to every
// real day. A row with a missing started_at therefore formed its own silent bucket, and
// withLoggedOn posted it to the server as the row's day.
describe('instantToDay — an unreadable instant has no day', () => {
  it.each(['', 'not-a-date', 'undefined', '2026-13-45T99:99:99Z'])(
    'returns empty string for %p rather than a NaN-shaped day', (bad) => {
      const day = instantToDay(bad)
      expect(day).toBe('')
      expect(day).not.toContain('NaN')
    })

  it('still reads a real instant', () => {
    expect(instantToDay('2026-08-01T10:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('entryDay falls through to logged_on when the instant is unreadable', () => {
    expect(entryDay({ logged_on: '2026-08-01', logged_at: 'not-a-date' })).toBe('2026-08-01')
    // and reports "unknown" rather than a fake day when there is no stored day either
    expect(entryDay({ logged_at: 'not-a-date' })).toBe('')
  })

  it('workoutDay reports unknown rather than a fake day', () => {
    expect(workoutDay({ started_at: 'not-a-date' })).toBe('')
    expect(workoutDay({ started_at: '', tz_offset_minutes: -240 })).toBe('')
  })

  it('withLoggedOn sends no day rather than a NaN one, so the server falls back', () => {
    const sent = withLoggedOn({ logged_at: 'not-a-date' })
    expect(sent.logged_on).toBe('')
    expect(sent.logged_on).not.toContain('NaN')
  })
})

// The idiom this replaces had no safe outcome for an unknown day: it either threw
// RangeError out of date-fns and unmounted the route, or -- for '' -- rendered a
// confident "Jan 1, 1900". Both were observed in the running app.
describe('formatDay', () => {
  it('draws a real day', () => {
    expect(formatDay('2026-08-01', 'monthDayYear')).toBe('Aug 1, 2026')
    expect(formatDay('2026-08-01', 'numericMonthDay')).toBe('8/1')
  })

  it.each([
    ['empty', ''],
    ['the NaN-shaped day instantToDay used to build', 'NaN-NaN-NaN'],
    ['an instant, not a day', '2026-08-01T10:00:00Z'],
    ['a rolled-over month', '2026-13-45'],
    ['a rolled-over day', '2026-02-31'],
    ['null', null],
    ['undefined', undefined],
  ])('reads as unknown when the day is %s', (_label, day) => {
    expect(formatDay(day as string, 'monthDayYear')).toBe(UNKNOWN_DAY)
  })

  it('never renders a 1900 for a day it could not read', () => {
    // The specific lie: Number('') === 0, and new Date(0, -1, 1) is a valid 1899.
    expect(formatDay('', 'monthDayYear')).not.toContain('1900')
    expect(formatDay('', 'monthDayYear')).not.toContain('1899')
  })

  it('never throws, whatever it is handed', () => {
    for (const bad of ['', 'x', 'NaN-NaN-NaN', '9999999-01-01', '0000-00-00']) {
      expect(() => formatDay(bad, 'weekdayDate')).not.toThrow()
    }
  })

  it('composes with the day helpers, so an unreadable row reads as unknown end to end', () => {
    expect(formatDay(workoutDay({ started_at: 'not-a-date' }), 'monthDayYear')).toBe(UNKNOWN_DAY)
    expect(formatDay(entryDay({ logged_at: '' }), 'monthDayYear')).toBe(UNKNOWN_DAY)
    expect(formatDay(workoutDay({ started_at: '2026-08-01T10:00:00Z', tz_offset_minutes: 0 }), 'monthDayYear'))
      .toBe('Aug 1, 2026')
  })
})

describe('memberSince', () => {
  it('renders the UTC month and year', () => {
    expect(memberSince('2026-08-19T14:30:00Z')).toBe('August 2026')
  })

  // The bug it exists for: Go's zero time is truthy and parses fine, so it used to be
  // formatted and shown as a real date on a brand new account.
  it('rejects Go\'s zero time rather than formatting it', () => {
    expect(memberSince('0001-01-01T00:00:00Z')).toBe('—')
  })

  it('reads as unknown for missing or unparseable input', () => {
    expect(memberSince(undefined)).toBe('—')
    expect(memberSince('')).toBe('—')
    expect(memberSince('not-a-date')).toBe('—')
  })

  // UTC, not the reader's clock: created_at carries no offset, so a local reading would
  // move a join date across a month boundary purely by travelling.
  it('does not shift the month with the reader\'s timezone', () => {
    expect(memberSince('2026-09-01T00:30:00Z')).toBe('September 2026')
    expect(memberSince('2026-08-31T23:30:00Z')).toBe('August 2026')
  })

  // The month name follows the app language; the UTC reading does not change with it.
  describe('in es', () => {
    beforeEach(async () => { await i18n.changeLanguage('es') })
    afterEach(async () => { await i18n.changeLanguage('en') })

    it('spells the month in Spanish', () => {
      expect(memberSince('2026-08-19T14:30:00Z')).toBe('agosto de 2026')
      expect(memberSince('2026-08-31T23:30:00Z')).toBe('agosto de 2026')
    })

    it('still reads as unknown for a missing timestamp', () => {
      expect(memberSince(undefined)).toBe('—')
    })
  })
})

// The en value of each name is the pattern the screens used before the patterns moved into the
// catalog, so English output cannot have changed. 2026-10-10 is a Saturday.
describe('display format names', () => {
  const day = '2026-10-10'
  const en: Record<DateFormatName, string> = {
    monthDay: 'Oct 10',
    monthDayYear: 'Oct 10, 2026',
    numericMonthDay: '10/10',
    weekdayDate: 'Saturday, October 10, 2026',
    monthShort: 'Oct',
    longDate: 'October 10, 2026',
    weekdayNarrow: 'S',
    weekdayMonthDayLong: 'Saturday, October 10',
    weekdayMonthDay: 'Sat, Oct 10',
    weekdayMonthDayYear: 'Sat, Oct 10, 2026',
    year: '2026',
    monthYearLong: 'October 2026',
    time: '12:00 PM',
    monthDayTime: 'Oct 10, 12:00 PM',
  }

  it.each(Object.entries(en))('en %s', (name, expected) => {
    expect(formatDay(day, name as DateFormatName)).toBe(expected)
    expect(formatDate(dayToLocalDate(day), name as DateFormatName)).toBe(expected)
  })

  describe('in es', () => {
    beforeEach(async () => { await i18n.changeLanguage('es') })
    afterEach(async () => { await i18n.changeLanguage('en') })

    it('reorders and translates', () => {
      expect(formatDay(day, 'monthDay')).toBe('10 oct')
      expect(formatDay(day, 'numericMonthDay')).toBe('10/10')
      expect(formatDay('2026-08-01', 'numericMonthDay')).toBe('1/8')
      expect(formatDay(day, 'weekdayDate')).toBe('sábado, 10 de octubre de 2026')
      expect(formatDay(day, 'monthYearLong')).toBe('octubre de 2026')
      expect(formatDay(day, 'time')).toBe('12:00')
      expect(formatDay(day, 'monthDayTime')).toBe('10 oct, 12:00')
    })

    it('keeps an unknown day unknown', () => {
      expect(formatDay('', 'monthDay')).toBe(UNKNOWN_DAY)
    })
  })
})

describe('relativeDayLabel', () => {
  it('names today and yesterday, else the weekday and date', () => {
    expect(relativeDayLabel(todayStr())).toBe('Today')
    expect(relativeDayLabel(daysAgoStr(1))).toBe('Yesterday')
    expect(relativeDayLabel('2020-10-10')).toBe('Sat, Oct 10')
  })

  it('follows the language (es)', async () => {
    await i18n.changeLanguage('es')
    try {
      expect(relativeDayLabel(todayStr())).toBe('Hoy')
      expect(relativeDayLabel(daysAgoStr(1))).toBe('Ayer')
      expect(relativeDayLabel('2020-10-10')).toBe('sáb, 10 oct')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('defaultWorkoutName', () => {
  it('is "Workout — " and the short date', () => {
    expect(defaultWorkoutName(new Date(2026, 9, 10, 8))).toBe('Workout — Oct 10')
  })

  it('is Spanish in es', async () => {
    await i18n.changeLanguage('es')
    try {
      expect(defaultWorkoutName(new Date(2026, 9, 10, 8))).toBe('Entrenamiento — 10 oct')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('formatInstant', () => {
  const today = () => { const n = new Date(); n.setHours(15, 42, 0, 0); return n }

  it('shows the time alone for today', () => {
    expect(formatInstant(today().toISOString())).toBe('3:42 PM')
  })

  it('adds the date for another day', () => {
    expect(formatInstant(new Date(2020, 9, 10, 15, 42).toISOString())).toBe('Oct 10, 3:42 PM')
  })

  it('reads an unreadable instant as unknown', () => {
    expect(formatInstant('garbage')).toBe(UNKNOWN_DAY)
  })

  describe('in es', () => {
    beforeEach(async () => { await i18n.changeLanguage('es') })
    afterEach(async () => { await i18n.changeLanguage('en') })

    it('draws 24-hour times and day-month order', () => {
      expect(formatInstant(today().toISOString())).toBe('15:42')
      expect(formatInstant(new Date(2020, 9, 10, 15, 42).toISOString())).toBe('10 oct, 15:42')
    })
  })
})
