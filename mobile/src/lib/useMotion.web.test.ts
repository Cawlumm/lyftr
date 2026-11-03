import { renderHook, act } from '@testing-library/react-native'
import { useMotion } from './useMotion.web'

describe('useMotion.web', () => {
  it('reads prefers-reduced-motion and follows changes', async () => {
    let matches = true
    let listener: () => void = () => {}
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      get matches() { return matches },
      addEventListener: (_: string, l: () => void) => { listener = l },
      removeEventListener: () => {},
    })
    const { result } = await renderHook(() => useMotion())
    expect(result.current.duration(180)).toBe(0)
    matches = false
    await act(async () => listener())
    expect(result.current.duration(180)).toBe(180)
  })
})
