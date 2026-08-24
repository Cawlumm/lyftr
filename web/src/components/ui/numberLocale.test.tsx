import { describe, it, expect, afterEach } from 'vitest'
import { configureNumberLocale, formatNumber } from '@lyftr/shared'

// Web never needed the *input* half of #141 — <input type="number"> lets the browser parse
// the locale's own separator, which is why that bug was Android-only. But display is
// ours on both platforms, and until this landed web rendered a canonical "." in every
// caption while its own number input showed the reader's separator: the same split the
// mobile weight card had.
//
// Web reads the separators from Intl rather than having them injected (mobile can't —
// Hermes leaves formatToParts unimplemented on iOS), so this also pins that the browser
// path produces the values the shared formatter expects.
describe('number display locale (web)', () => {
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',', locale: 'en-US' }))

  // Mirrors what web/src/lib/lyftr.ts passes. All three fields matter and they do
  // different jobs: decimal/group are what sanitizeNumericInput parses against, while
  // `locale` is what Intl formats with. Configure only the separators and display
  // silently stays en-US — which is the one locale these bugs never show up in.
  const separatorsFor = (locale: string) => {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234.5)
    return {
      decimal: parts.find((p) => p.type === 'decimal')?.value,
      group: parts.find((p) => p.type === 'group')?.value,
      locale,
    }
  }

  it('reads separators out of Intl the way lyftr.ts does', () => {
    expect(separatorsFor('en-US')).toEqual({ decimal: '.', group: ',', locale: 'en-US' })
    expect(separatorsFor('de-DE')).toEqual({ decimal: ',', group: '.', locale: 'de-DE' })
  })

  it('formats a weight in the reader notation once configured', () => {
    configureNumberLocale(separatorsFor('de-DE'))
    expect(formatNumber(173.1)).toBe('173,1')
    expect(formatNumber(-4.6)).toBe('-4,6')
  })

  it('leaves en-US untouched, so nothing changes for most readers', () => {
    configureNumberLocale(separatorsFor('en-US'))
    expect(formatNumber(173.1)).toBe('173.1')
  })

  // The one rule that must not be broken by a later sweep: numbers that are geometry, not
  // text, stay canonical. A localised SVG path emits "M12,5,34,1" and the path parser
  // reads the comma as a coordinate separator, collapsing the chart.
  it('does not affect toFixed, which is what path builders use', () => {
    configureNumberLocale(separatorsFor('de-DE'))
    expect((12.5).toFixed(1)).toBe('12.5')
  })
})
