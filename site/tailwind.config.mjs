/** @type {import('tailwindcss').Config} */
// Brand tokens mirror web/tailwind.config.ts + web/src/index.css (dark-mode values), so the
// site matches the app 1:1. The landing is dark-only, so surface/tx tokens use the .dark values.
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          base: '#070d1a',
          raised: '#0d1629',
          overlay: '#111e35',
          border: '#1c2f50',
          muted: '#162240',
        },
        tx: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#64748b',
          inverse: '#0f172a',
        },
        brand: {
          50: '#e0f9ff',
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
        violet: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', DEFAULT: '#8b5cf6' },
        success: { 400: '#4ade80', 500: '#22c55e', DEFAULT: '#22c55e' },
        warning: { 400: '#facc15', 500: '#eab308', DEFAULT: '#eab308' },
        error: { 400: '#f87171', 500: '#ef4444', DEFAULT: '#ef4444' },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #00b8d9 0%, #8b5cf6 100%)',
      },
      boxShadow: {
        'glow-sm': '0 0 16px rgba(0,184,217,0.18)',
        'card-md': '0 4px 16px rgba(0,0,0,0.12)',
        glow: '0 0 60px rgba(0,184,217,0.25)',
      },
    },
  },
  plugins: [],
};
