import { validateCustomExercise } from './validateCustomExercise'

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
    expect(validateCustomExercise({ name: 'Soleus\tSlouch', muscle: 'calves' })).toEqual({ name: 'controlChars' })
  })
})
