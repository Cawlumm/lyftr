import type { Exercise } from '@lyftr/shared'
import { cancelExerciseCreate, hasExerciseCreate, requestExerciseCreate, resolveExerciseCreate } from './exerciseCreateRequests'

const ex = { id: 1, name: 'Soleus Slouch' } as Exercise

describe('exercise create requests', () => {
  it('hands the exercise to the caller that registered it, and forgets it', () => {
    const onCreated = jest.fn()
    const id = requestExerciseCreate(onCreated)
    expect(resolveExerciseCreate(id, ex)).toBe(true)
    expect(onCreated).toHaveBeenCalledWith(ex)
    expect(resolveExerciseCreate(id, ex)).toBe(false)
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it('knows whether a request is still waiting', () => {
    const id = requestExerciseCreate(jest.fn())
    expect(hasExerciseCreate(id)).toBe(true)
    resolveExerciseCreate(id, ex)
    expect(hasExerciseCreate(id)).toBe(false)
    expect(hasExerciseCreate('create-old')).toBe(false)
  })

  it('gives every request its own id', () => {
    const a = jest.fn()
    const b = jest.fn()
    const ia = requestExerciseCreate(a)
    const ib = requestExerciseCreate(b)
    expect(ia).not.toBe(ib)
    resolveExerciseCreate(ib, ex)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })

  it('answers false for an unknown id, and for one that was cancelled', () => {
    expect(resolveExerciseCreate('nope', ex)).toBe(false)
    const onCreated = jest.fn()
    const id = requestExerciseCreate(onCreated)
    cancelExerciseCreate(id)
    expect(resolveExerciseCreate(id, ex)).toBe(false)
    expect(onCreated).not.toHaveBeenCalled()
  })
})
