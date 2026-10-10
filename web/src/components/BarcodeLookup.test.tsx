import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { i18n } from '@lyftr/shared'
import BarcodeLookup from './BarcodeLookup'

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('BarcodeLookup', () => {
  // The silence past a few seconds is what made people rescan (#164), so a slow lookup
  // says it is still going rather than sitting on the first line indefinitely.
  it('says it is still looking once the lookup runs long', () => {
    vi.useFakeTimers()
    render(<BarcodeLookup code="3017620422003" />)

    expect(screen.getByText('Looking up this product…')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.getByText('Still looking. This can take a few seconds.')).toBeTruthy()
  })

  it('reads its copy from the catalog in Spanish', async () => {
    await i18n.changeLanguage('es')
    vi.useFakeTimers()
    render(<BarcodeLookup code="3017620422003" />)

    expect(screen.getByText('Buscando este producto…')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.getByText('Seguimos buscando. Esto puede tardar unos segundos.')).toBeTruthy()
  })
})
