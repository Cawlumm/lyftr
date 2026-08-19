import { MIN_PASSWORD_LENGTH, newPasswordRules, ruleState } from './passwordRules'

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
