import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
// Deep import, not the package index: loading tailwind.config.ts must not pull axios,
// zustand and the API client into PostCSS. tokens.ts is deliberately dependency-free.
import { palette, cssVars, GRADIENT_CSS } from '@lyftr/shared/src/theme/tokens'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Surface/text tokens stay CSS-variable-backed so one class works in both
        // themes; the values behind the vars are emitted by the plugin below.
        surface: {
          base:    'var(--surface-base)',
          raised:  'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          border:  'var(--surface-border)',
          muted:   'var(--surface-muted)',
        },
        tx: {
          primary:   'var(--tx-primary)',
          secondary: 'var(--tx-secondary)',
          muted:     'var(--tx-muted)',
          inverse:   'var(--tx-inverse)',
        },
        brand:   palette.brand,
        violet:  palette.violet,
        success: palette.success,
        warning: palette.warning,
        error:   palette.error,
      },
      backgroundImage: {
        'gradient-brand': GRADIENT_CSS,
      },
      boxShadow: {
        'glow-sm':  '0 0 16px rgba(0,184,217,0.18)',
        'card':     '0 1px 2px rgba(0,0,0,0.08)',
        'card-md':  '0 4px 16px rgba(0,0,0,0.12)',
        'dropdown': '0 8px 24px rgba(0,0,0,0.20), 0 0 0 1px var(--surface-border)',
      },
    },
  },
  plugins: [
    // Emit the theme custom properties from the shared tokens instead of hand-writing
    // them in index.css. Light is the :root default, dark is the .dark override —
    // same contract as before, one less copy of the hex values.
    plugin(({ addBase }) => {
      addBase({
        ':root': cssVars('light'),
        '.dark': cssVars('dark'),
      })
    }),
  ],
} satisfies Config
