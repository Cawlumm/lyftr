import type { Config } from 'tailwindcss'

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
        // CSS-variable-backed surface tokens — light/dark handled in CSS
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
        // Brand — electric cyan
        brand: {
          50:  '#e0f9ff',
          100: '#b0f1fe',
          200: '#7ae7fd',
          300: '#38d8fb',
          400: '#0ecef7',
          500: '#00b8d9',
          600: '#0099b8',
          700: '#007a96',
          800: '#005c72',
          900: '#003d4d',
          DEFAULT: '#00b8d9',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          DEFAULT: '#8b5cf6',
        },
        success: { 400: '#4ade80', 500: '#22c55e', DEFAULT: '#22c55e' },
        warning: { 400: '#facc15', 500: '#eab308', DEFAULT: '#eab308' },
        error:   { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', DEFAULT: '#ef4444' },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #00b8d9 0%, #8b5cf6 100%)',
      },
      boxShadow: {
        'glow-sm':  '0 0 16px rgba(0,184,217,0.18)',
        'card':     '0 1px 2px rgba(0,0,0,0.08)',
        'card-md':  '0 4px 16px rgba(0,0,0,0.12)',
        'dropdown': '0 8px 24px rgba(0,0,0,0.20), 0 0 0 1px var(--surface-border)',
      },
    },
  },
  plugins: [],
} satisfies Config
