import { cleanName, cleanStep, validateCustomExercise } from './validateCustomExercise'

describe('validateCustomExercise', () => {
  it('needs a name that is not only spaces, and a muscle', () => {
    expect(validateCustomExercise({ name: '   ', muscle: null })).toEqual({ name: 'required', muscle: 'required' })
    expect(validateCustomExercise({ name: 'Soleus Slouch', muscle: null })).toEqual({ muscle: 'required' })
    expect(validateCustomExercise({ name: '', muscle: 'calves' })).toEqual({ name: 'required' })
  })

  it('has no errors when both are there', () => {
    expect(validateCustomExercise({ name: ' Soleus Slouch ', muscle: 'calves' })).toEqual({})
  })

  it('rejects control characters in the name, as the server does', () => {
    expect(validateCustomExercise({ name: 'Soleus\u0007 Slouch', muscle: 'calves' })).toEqual({ name: 'controlChars' })
    expect(validateCustomExercise({ name: 'Soleus\u0000Slouch', muscle: 'calves' })).toEqual({ name: 'controlChars' })
  })

  it('holds the steps to the server limits, counting only the ones that will be saved', () => {
    const ok = { name: 'X', muscle: 'calves' }
    expect(validateCustomExercise({ ...ok, steps: ['a'.repeat(300), '   ', ''] })).toEqual({})
    expect(validateCustomExercise({ ...ok, steps: Array(31).fill('a') })).toEqual({ steps: 'tooMany' })
    expect(validateCustomExercise({ ...ok, steps: [...Array(30).fill('a'), ' '] })).toEqual({})
    expect(validateCustomExercise({ ...ok, steps: ['a'.repeat(301)] })).toEqual({ steps: 'stepTooLong' })
    // Seven 290-character steps join to more than 2000 ("1. " prefixes and line breaks count).
    expect(validateCustomExercise({ ...ok, steps: Array(7).fill('a'.repeat(290)) })).toEqual({ steps: 'textTooLong' })
    expect(validateCustomExercise({ ...ok, steps: Array(6).fill('a'.repeat(290)) })).toEqual({})
  })

  it('reads tabs as spaces and ignores zero-width characters in the name', () => {
    expect(validateCustomExercise({ name: 'Row\tup', muscle: 'back' })).toEqual({})
    expect(validateCustomExercise({ name: '\u200B\u200C\u200D\u2060\uFEFF', muscle: 'back' }).name).toBe('required')
    expect(validateCustomExercise({ name: ' \t ', muscle: 'back' }).name).toBe('required')
    expect(validateCustomExercise({ name: 'Ro\u200Bw\u0007', muscle: 'back' }).name).toBe('controlChars')
  })

  it('counts a tab in a step as one space and drops a step of only tabs', () => {
    expect(cleanName('a\u200Bb\tc ')).toBe('ab c')
    expect(cleanStep('\tdo\tit\t')).toBe('do it')
    expect(validateCustomExercise({ name: 'A', muscle: 'back', steps: ['\t', '\t'] })).toEqual({})
  })
})
