import { displayName, nameInitial } from './profile'

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
})
