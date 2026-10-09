import { displayName, emailChanged, nameInitial, onlyLetterCaseChanged } from './profile'

describe('displayName', () => {
  it('prefers the name the person chose', () => {
    expect(displayName('Carter', 'cwlumm@gmail.com')).toBe('Carter')
  })

  it('falls back to the local part of the email when no name is set', () => {
    expect(displayName('', 'carter@example.com')).toBe('carter')
    expect(displayName(undefined, 'carter@example.com')).toBe('carter')
  })

  // A row written before the server trimmed, or a settings payload from an older
  // instance; either way the greeting must not open with a space.
  it('trims a stored name, and treats a whitespace-only one as unset', () => {
    expect(displayName('  Carter  ', 'carter@example.com')).toBe('Carter')
    expect(displayName('   ', 'carter@example.com')).toBe('carter')
  })

  // The empty-user window while the first /me is in flight.
  it('reads as a sentence when there is neither name nor email', () => {
    expect(displayName(undefined, undefined)).toBe('there')
    expect(displayName('', '')).toBe('there')
  })

  it('keeps a name that happens to contain an @', () => {
    expect(displayName('@carter', 'carter@example.com')).toBe('@carter')
  })
})

describe('nameInitial', () => {
  it('is the first letter of whatever displayName returned', () => {
    expect(nameInitial(displayName('Carter', 'x@y.z'))).toBe('C')
    expect(nameInitial(displayName('', 'carter@example.com'))).toBe('C')
  })

  // Not every name starts with a Latin letter, and toUpperCase must not mangle one.
  it('leaves a non-cased first character alone', () => {
    expect(nameInitial('日本')).toBe('日')
  })

  // The name is free text, so it can start outside the BMP. charAt(0) would return half
  // a surrogate pair here and the avatar would render a replacement glyph.
  it('takes a whole code point, not half a surrogate pair', () => {
    expect(nameInitial('🦍 Carter')).toBe('🦍')
    expect(nameInitial('🦍 Carter')).toHaveLength(2) // one code point, two UTF-16 units
  })
})

describe('onlyLetterCaseChanged', () => {
  it('is true when only ASCII letter case differs', () => {
    expect(onlyLetterCaseChanged('Carter@X.com', 'carter@x.com')).toBe(true)
    expect(onlyLetterCaseChanged(' CARTER@x.com ', 'carter@x.com')).toBe(true)
  })

  it('is false for the same spelling, a different address, nothing typed or no current', () => {
    expect(onlyLetterCaseChanged('carter@x.com', 'carter@x.com')).toBe(false)
    expect(onlyLetterCaseChanged('other@x.com', 'carter@x.com')).toBe(false)
    expect(onlyLetterCaseChanged('', 'carter@x.com')).toBe(false)
    expect(onlyLetterCaseChanged('carter@x.com', undefined)).toBe(false)
  })

  it('folds ASCII only, as NOCASE does, so a non-ASCII case difference is a real change', () => {
    expect(onlyLetterCaseChanged('MÜller@x.com', 'müller@x.com')).toBe(false)
  })
})

describe('emailChanged', () => {
  it('is false for nothing typed or the same address', () => {
    expect(emailChanged('', 'a@x.com')).toBe(false)
    expect(emailChanged('   ', 'a@x.com')).toBe(false)
    expect(emailChanged('a@x.com', 'a@x.com')).toBe(false)
    expect(emailChanged(' a@x.com ', 'a@x.com')).toBe(false)
  })

  it('counts a letter-case change, which the server allows', () => {
    expect(emailChanged('A@x.com', 'a@x.com')).toBe(true)
  })

  it('is true for a different address, or when there is no current one', () => {
    expect(emailChanged('b@x.com', 'a@x.com')).toBe(true)
    expect(emailChanged('b@x.com', undefined)).toBe(true)
  })
})
