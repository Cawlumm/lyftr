import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { i18n } from '@lyftr/shared'
import { titleKeyForSegments, useDocumentTitle } from './useDocumentTitle'

describe('titleKeyForSegments', () => {
  it('maps a section and its sub-screens to one title', () => {
    expect(titleKeyForSegments(['(tabs)'])).toBe('nav.home')
    expect(titleKeyForSegments(['(tabs)', 'workouts'])).toBe('nav.workouts')
    expect(titleKeyForSegments(['(tabs)', 'workouts', '[id]'])).toBe('nav.workouts')
    expect(titleKeyForSegments(['(auth)', 'login'])).toBe('auth.login.submit')
    expect(titleKeyForSegments([])).toBeNull()
  })
})

describe('useDocumentTitle', () => {
  const os = Platform.OS
  const g = globalThis as { document?: unknown }
  const hadDocument = 'document' in g
  const prevDocument = g.document
  beforeEach(() => { g.document = { title: 'unset' } })
  afterEach(() => {
    Platform.OS = os
    if (hadDocument) g.document = prevDocument
    else delete g.document
  })

  it('on web, sets the title from the route and follows the language', async () => {
    Platform.OS = 'web'
    await act(async () => { await i18n.changeLanguage('en') })
    await renderHook(() => useDocumentTitle(['(tabs)', 'workouts']))
    expect((g.document as { title: string }).title).toBe('Workouts · Lyftr')
    await act(async () => { await i18n.changeLanguage('es') })
    await renderHook(() => useDocumentTitle(['(tabs)', 'workouts']))
    expect((g.document as { title: string }).title).toBe('Entrenos · Lyftr')
    await act(async () => { await i18n.changeLanguage('en') })
  })

  it('falls back to the app title on an unmapped route', async () => {
    Platform.OS = 'web'
    await act(async () => { await i18n.changeLanguage('en') })
    await renderHook(() => useDocumentTitle([]))
    expect((g.document as { title: string }).title).toBe('Lyftr — Workout & Nutrition Tracker')
  })

  it('on native, leaves the document alone', async () => {
    Platform.OS = 'ios'
    await renderHook(() => useDocumentTitle(['(tabs)']))
    expect((g.document as { title: string }).title).toBe('unset')
  })
})
