import { registrationOpen, demoMode, customExercises, customExercisePhotos } from './useServerInfo'

// The one rule worth pinning: which values hide the "Create account" affordance.
// Getting the absent case backwards would hide signup on every server older than the
// REGISTRATION feature — a silent, total break of the only way to make an account,
// against backends the user cannot upgrade.
describe('registrationOpen', () => {
  it('is open when the server says so', () => {
    expect(registrationOpen({ name: 'lyftr', version: '1.0.0', registration_open: true })).toBe(true)
  })

  it('is closed only on an explicit false', () => {
    expect(registrationOpen({ name: 'lyftr', version: '1.0.0', registration_open: false })).toBe(false)
  })

  it('is open when the field is absent — a backend older than this feature', () => {
    expect(registrationOpen({ name: 'lyftr', version: '0.1.0' })).toBe(true)
  })

  it('is open while the probe is still in flight or the server is unreachable', () => {
    expect(registrationOpen(null)).toBe(true)
    expect(registrationOpen(undefined)).toBe(true)
  })
})

// The mirror image of the rule above, and the polarity is the point: every uncertain case
// resolves to "no demo button". Offering one where no demo account was seeded produces a
// sign-in that 401s, which reads as a broken app rather than a missing feature — so absent,
// unreachable and still-loading all mean no, and only an explicit true means yes.
describe('demoMode', () => {
  it('is on only when the server explicitly says so', () => {
    expect(demoMode({ name: 'lyftr', version: '1.0.0', demo_mode: true })).toBe(true)
  })

  it('is off on an explicit false — a self-hosted instance', () => {
    expect(demoMode({ name: 'lyftr', version: '1.0.0', demo_mode: false })).toBe(false)
  })

  it('is off when the field is absent — a backend older than this feature', () => {
    expect(demoMode({ name: 'lyftr', version: '0.1.0' })).toBe(false)
  })

  it('is off while the probe is still in flight or the server is unreachable', () => {
    expect(demoMode(null)).toBe(false)
    expect(demoMode(undefined)).toBe(false)
  })
})

// Same polarity as demoMode: an older server has no create endpoint, so only an explicit
// true offers Create.
describe('customExercises', () => {
  it('is on only when the server explicitly says so', () => {
    expect(customExercises({ name: 'lyftr', version: '1.0.0', custom_exercises: true })).toBe(true)
  })

  it('is off when the field is absent — a backend older than this feature', () => {
    expect(customExercises({ name: 'lyftr', version: '0.1.0' })).toBe(false)
  })

  it('is off while the probe is still in flight or the server is unreachable', () => {
    expect(customExercises(null)).toBe(false)
    expect(customExercises(undefined)).toBe(false)
  })
})

describe('customExercisePhotos', () => {
  it('is on only on an explicit true', () => {
    expect(customExercisePhotos({ name: 'lyftr', version: '1.0.0', custom_exercise_photos: true })).toBe(true)
    expect(customExercisePhotos({ name: 'lyftr', version: '1.0.0', custom_exercise_photos: false })).toBe(false)
  })

  it('is off for an older server, a pending probe and an unreachable server', () => {
    expect(customExercisePhotos({ name: 'lyftr', version: '0.1.0' })).toBe(false)
    expect(customExercisePhotos(null)).toBe(false)
    expect(customExercisePhotos(undefined)).toBe(false)
  })
})
