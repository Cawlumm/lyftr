import { useEffect, useLayoutEffect } from 'react'
import { Platform } from 'react-native'
import { palette, surfaces, useTranslation } from '@lyftr/shared'
import { palettes } from '../theme/theme'

// Replaces the theme-color tag rather than editing it: browsers diff the value to decide
// whether to repaint their chrome, and setAttribute on the existing element is not reliably
// seen as a change (same reason as web/src/lib/lyftr.ts). Follows the stored theme, not
// prefers-color-scheme, since the stored theme is what the app draws.
// Layout effect so the colour scheme and --tx-muted land before first paint; useEffect on the
// server, where useLayoutEffect only warns.
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect

export function useDocumentChrome(mode: 'light' | 'dark') {
  useBeforePaint(() => {
    if (Platform.OS !== 'web') return
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', surfaces[mode].base)
    document.head.appendChild(meta)
    document.documentElement.style.colorScheme = mode
    // An inline custom property outranks global.css's :root and .dark:root blocks.
    document.documentElement.style.setProperty('--tx-muted', channels(palettes[mode].txMuted))
  }, [mode])

  // index.html ships lang="en"; a Spanish UI announced with English pronunciation rules is
  // garbled to a screen reader (WCAG 3.1.1), so <html lang> follows the app language.
  const { i18n } = useTranslation()
  useEffect(() => {
    if (Platform.OS !== 'web') return
    document.documentElement.lang = i18n.language
  }, [i18n.language])
}

// "r g b" channels, the form global.css's variables take so <alpha-value> keeps working.
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

// White labels sit on solid brand-500 fills across the app (primary actions, the session
// pill), and white on brand-500 measures 2.4:1. On web those fills move to brand-700 (5.0:1)
// and their hover to brand-800, overriding the utilities themselves so no call site changes.
// Translucent tints (bg-brand-500/10) are separate classes and keep their look.
// The export's preflight colours an EMPTY input itself gray-400 (input:placeholder-shown, the
// fallback emitted for ::placeholder), which axe reads as 2.3:1 text; the placeholder that is
// painted comes from placeholderTextColor and passes. Resetting the empty input to primary ink
// also gives the caret a readable colour. Appended last in <head>, so these follow NativeWind's
// stylesheet and win at equal specificity.
const WEB_CONTRAST_ID = 'web-contrast'
const WEB_CONTRAST_CSS = [
  `.bg-brand-500 { background-color: ${palette.brand[700]}; }`,
  `.border-brand-500 { border-color: ${palette.brand[700]}; }`,
  `@media (hover: hover) and (pointer: fine) { .hover\\:bg-brand-600:hover { background-color: ${palette.brand[800]}; } }`,
  // After the hover rule at equal specificity, so a press darkens past hover instead of losing to it.
  `.active\:bg-brand-700:active { background-color: ${palette.brand[900]}; }`,
  ':is(input, textarea):placeholder-shown { color: rgb(var(--tx-primary)); }',
].join('\n')

// Injected at import, not in an effect, so the stylesheet exists before the first paint.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById(WEB_CONTRAST_ID)) {
  const style = document.createElement('style')
  style.id = WEB_CONTRAST_ID
  style.textContent = WEB_CONTRAST_CSS
  document.head.appendChild(style)
}
