import { useThemeStore } from '../lib/lyftr'

// Thin adapter over the shared theme store, keeping the shape the four call sites
// already use ({ theme, toggleTheme, isDark }).
//
// This was a plain hook with its own useState, which meant every component that called
// it held a SEPARATE copy of the theme. Toggling in Settings re-themed the document but
// left the toggle in Layout — mounted the whole time — still reporting the old value
// until it happened to remount. One store, one answer.
//
// The <html class="dark"> side effect lives in lib/lyftr.ts: applied once before the
// first render and re-applied via a store subscription, rather than from an effect in
// whichever component happened to mount.
export function useTheme() {
  const theme = useThemeStore((s) => s.mode)
  const toggle = useThemeStore((s) => s.toggle)
  return { theme, toggleTheme: toggle, isDark: theme === 'dark' }
}
