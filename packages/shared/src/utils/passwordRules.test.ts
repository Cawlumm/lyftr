import {
  byteLength,
  characterLength,
  lengthRuleLabel,
  matchRuleLabel,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  newPasswordRules,
  ruleState,
} from './passwordRules'

describe('ruleState', () => {
  it('is pending until the field is touched, whatever the answer would be', () => {
    expect(ruleState(false, false)).toBe('pending')
    expect(ruleState(false, true)).toBe('pending')
  })

  it('reports the answer once touched', () => {
    expect(ruleState(true, true)).toBe('ok')
    expect(ruleState(true, false)).toBe('bad')
  })
})

describe('newPasswordRules on sign-up (no current password)', () => {
  it('holds every rule pending on an empty form, and is not ready', () => {
    const r = newPasswordRules({ password: '', confirm: '' })
    expect(r).toMatchObject({ length: 'pending', different: 'pending', match: 'pending', ready: false })
  })

  it('never applies the "different" rule — there is no previous password to differ from', () => {
    const r = newPasswordRules({ password: 'password123', confirm: 'password123' })
    expect(r.different).toBe('pending')
    expect(r.ready).toBe(true)
  })

  it('fails a short password and passes one exactly at the minimum', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(newPasswordRules({ password: short, confirm: short })).toMatchObject({ length: 'bad', ready: false })

    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH)
    expect(newPasswordRules({ password: exact, confirm: exact })).toMatchObject({ length: 'ok', ready: true })
  })

  it('is not ready while the confirmation differs', () => {
    const r = newPasswordRules({ password: 'password123', confirm: 'password12' })
    expect(r).toMatchObject({ match: 'bad', ready: false })
  })

  it('leaves match pending while the confirmation is empty, rather than calling it wrong', () => {
    const r = newPasswordRules({ password: 'password123', confirm: '' })
    expect(r).toMatchObject({ match: 'pending', ready: false })
  })
})

describe('newPasswordRules on change-password (current supplied)', () => {
  const current = 'password123'

  it('applies the "different" rule and blocks a no-op change', () => {
    const r = newPasswordRules({ password: current, confirm: current, current })
    expect(r).toMatchObject({ length: 'ok', match: 'ok', different: 'bad', ready: false })
  })

  it('is ready once the new password is long enough, matching, and different', () => {
    const r = newPasswordRules({ password: 'newpassword456', confirm: 'newpassword456', current })
    expect(r).toMatchObject({ length: 'ok', match: 'ok', different: 'ok', ready: true })
  })

  // The current-password box is the one field with no rule of its own, so nothing else
  // would stop a submit that cannot possibly succeed.
  it('is not ready while the current password is blank', () => {
    const r = newPasswordRules({ password: 'newpassword456', confirm: 'newpassword456', current: '' })
    expect(r.ready).toBe(false)
    expect(r.different).toBe('pending')
  })

  // An empty current password would otherwise satisfy "different" for free and light up
  // green before the user has said anything about it.
  it('holds "different" pending until both the current and the new password have content', () => {
    expect(newPasswordRules({ password: '', confirm: '', current }).different).toBe('pending')
    expect(newPasswordRules({ password: 'newpassword456', confirm: '', current: '' }).different).toBe('pending')
  })
})

describe('rule labels', () => {
  it('states the length rule using the shared minimum', () => {
    expect(lengthRuleLabel()).toBe(`At least ${MIN_PASSWORD_LENGTH} characters`)
  })

  // The pending wording is the point of routing this through the state: an untouched
  // confirmation box must not claim the passwords already match.
  it('does not claim a match before the confirmation is touched', () => {
    expect(matchRuleLabel('pending')).not.toMatch(/match/i)
    expect(matchRuleLabel('ok')).toBe('Passwords match')
    expect(matchRuleLabel('bad')).toBe('Passwords do not match')
  })
})

describe('length is measured the way the server measures it', () => {
  // JavaScript's .length counts UTF-16 code units, so four emoji look like eight
  // characters. The server counts runes and sees four — the client used to accept a
  // password the server then rejected on submit.
  it('counts characters, not UTF-16 code units, for the minimum', () => {
    const fourEmoji = '\u{1F3CB}'.repeat(4)
    expect(fourEmoji.length).toBe(8)
    expect(characterLength(fourEmoji)).toBe(4)
    expect(newPasswordRules({ password: fourEmoji, confirm: fourEmoji })).toMatchObject({
      length: 'bad',
      ready: false,
    })
  })

  it('counts bytes for the maximum, matching bcrypt', () => {
    expect(byteLength('a'.repeat(72))).toBe(72)
    expect(byteLength('\u{1F3CB}'.repeat(19))).toBe(76)
  })

  it('accepts exactly the byte limit and rejects one over', () => {
    const atLimit = 'a'.repeat(MAX_PASSWORD_BYTES)
    expect(newPasswordRules({ password: atLimit, confirm: atLimit })).toMatchObject({ length: 'ok', ready: true })

    const over = 'a'.repeat(MAX_PASSWORD_BYTES + 1)
    expect(newPasswordRules({ password: over, confirm: over })).toMatchObject({ length: 'bad', ready: false })
  })

  // 19 characters, 76 bytes — long enough to be refused while looking far too short to be.
  it('rejects a multibyte passphrase well under the character limit', () => {
    const emoji = '\u{1F3CB}'.repeat(19)
    expect(characterLength(emoji)).toBeLessThan(MAX_PASSWORD_BYTES)
    expect(newPasswordRules({ password: emoji, confirm: emoji }).ready).toBe(false)
  })

  // Telling someone with a 100-character password that they need at least 8 sends them
  // in the wrong direction.
  it('flips the label when the password is too long', () => {
    expect(lengthRuleLabel('a'.repeat(10))).toMatch(/at least/i)
    expect(lengthRuleLabel('a'.repeat(MAX_PASSWORD_BYTES + 1))).toMatch(/at most/i)
    expect(lengthRuleLabel()).toMatch(/at least/i)
  })
})
