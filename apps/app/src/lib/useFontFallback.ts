import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

// How long web waits for the custom fonts before rendering with the system fallback. On web
// loadAsync resolves only when the browser has the font file, and expo-font has no timeout
// of its own, so a blocked or black-holed font host would hold the loader up forever.
// 3s matches FontFaceObserver's default and the 3s block period of font-display: block.
export const FONT_TIMEOUT_MS = 3000

// Native bundles the fonts, so it never gives up on them. Once the timer fires on web the
// answer stays true, so fonts arriving late swap in without remounting the tree.
export function useFontFallback(loaded: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (Platform.OS !== 'web' || loaded) return
    const id = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [loaded])
  return loaded || timedOut
}
