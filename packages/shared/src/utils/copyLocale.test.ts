import { i18n } from '../i18n'
import { differentRuleLabel, lengthRuleLabel, matchRuleLabel, MAX_PASSWORD_BYTES } from './passwordRules'
import { targetWeightLabel, weightError } from './weight'
import { dayLabel } from './programUtils'
import { formatLoggedAmount, maxAmountFor, scaleServing } from './food'
import { displayName } from './profile'
import { restLabel } from './workoutSets'
import type { FoodSearchResult, ProgramDay } from '../types'

// Copy returned by shared helpers is looked up when the helper runs. Each case switches the
// language to es, asserts the Spanish sentence, and the afterEach puts en back so no other
// test inherits it. The en assertions of the same helpers live in their own test files.
describe('shared helper copy in es', () => {
  beforeEach(async () => { await i18n.changeLanguage('es') })
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('password rule labels', () => {
    expect(lengthRuleLabel('')).toBe('Al menos 8 caracteres')
    expect(lengthRuleLabel('a'.repeat(MAX_PASSWORD_BYTES + 1))).toBe('Máximo 72 caracteres (los acentos y los emoji cuentan como más)')
    expect(differentRuleLabel()).toBe('Distinta de tu contraseña actual')
    expect(matchRuleLabel('ok')).toBe('Las contraseñas coinciden')
    expect(matchRuleLabel('bad')).toBe('Las contraseñas no coinciden')
    expect(matchRuleLabel('pending')).toBe('Repite la nueva contraseña')
  })

  it('weight errors keep the number and the unit', () => {
    expect(weightError(0, 'lbs')).toBe('Ingresa un peso válido')
    expect(weightError(3000, 'lbs')).toBe('El peso debe ser menor de 2000 lb')
    expect(weightError(1000, 'kg')).toBe('El peso debe ser menor de 907 kg')
  })

  it('a bodyweight target reads as the es abbreviation, a loaded one keeps its unit', () => {
    expect(targetWeightLabel(0, 'lbs')).toBe('PC')
    expect(targetWeightLabel(135, 'lbs')).toBe('135 lbs')
  })

  it('program day names', () => {
    const day = (d: Partial<ProgramDay>) => d as ProgramDay
    expect(dayLabel(day({ is_rest_day: true }), 0)).toBe('Día de descanso')
    expect(dayLabel(day({}), 2)).toBe('Día 3')
    expect(dayLabel(day({ name: 'Push Day' }), 2)).toBe('Push Day')
  })

  it('servings pick the es plural form and keep the figure as written', () => {
    expect(formatLoggedAmount({ servings: 1 })).toBe('1 porción')
    expect(formatLoggedAmount({ servings: 0.5 })).toBe('0.5 porciones')
    expect(formatLoggedAmount({ servings: 2 })).toBe('2 porciones')
    expect(maxAmountFor(null)).toBe('100 porciones')
    expect(maxAmountFor({ quantity: 100, unit: 'g' })).toBe('10000 g')
  })

  it('the name a blank entry is given', () => {
    const blank = { name: '', calories: 0, protein: 0, carbs: 0, fat: 0 } as FoodSearchResult
    expect(scaleServing(blank, 1).name).toBe('Registro personalizado')
  })

  it('the fallback for a missing name, and rest labels', () => {
    expect(displayName('', '')).toBe('usuario')
    expect(restLabel(45)).toBe('45 s')
    expect(restLabel(120)).toBe('2 min')
  })
})
