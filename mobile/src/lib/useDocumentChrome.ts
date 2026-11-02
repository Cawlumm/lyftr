import { useEffect } from 'react'
import { Platform } from 'react-native'
import { surfaces } from '@lyftr/shared'

// Replaces the theme-color tag rather than editing it: browsers diff the value to decide
// whether to repaint their chrome, and setAttribute on the existing element is not reliably
// seen as a change (same reason as web/src/lib/lyftr.ts). Follows the stored theme, not
// prefers-color-scheme, since the stored theme is what the app draws.
export function useDocumentChrome(mode: 'light' | 'dark') {
  useEffect(() => {
    if (Platform.OS !== 'web') return
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', surfaces[mode].base)
    document.head.appendChild(meta)
    document.documentElement.style.colorScheme = mode
  }, [mode])
}
