/** NativeWind (Tailwind for RN). Tokens ported from web/tailwind.config.ts +
 *  index.css. Surface/text tokens resolve from CSS variables (see global.css) so
 *  they flip between light + dark exactly like the web app; brand colors are
 *  theme-independent literals. */
module.exports = {
  // Class strategy: the .dark class is toggled by NativeWind's colorScheme,
  // driven from useThemeStore in app/_layout.tsx (mirrors web's `.dark` toggle).
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Brand fonts (loaded in app/_layout.tsx via @expo-google-fonts). Each WEIGHT is
      // its own family name in Expo, so Tailwind's `font-bold` (fontWeight) does
      // nothing useful with them — weight is picked by choosing the family. These
      // classes exist for the Typography primitives in src/components/ui/Typography.tsx;
      // screens should use those primitives rather than these classes directly.
      fontFamily: {
        display: 'Outfit_700Bold',
        'display-heavy': 'Outfit_800ExtraBold',
        sans: 'PlusJakartaSans_500Medium',
        'sans-semibold': 'PlusJakartaSans_600SemiBold',
        'sans-bold': 'PlusJakartaSans_700Bold',
        'sans-heavy': 'PlusJakartaSans_800ExtraBold',
      },
      colors: {
        // Surfaces + text resolve from CSS vars (global.css) → theme-aware.
        surface: {
          base: 'rgb(var(--surface-base) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
        },
        tx: {
          primary: 'rgb(var(--tx-primary) / <alpha-value>)',
          secondary: 'rgb(var(--tx-secondary) / <alpha-value>)',
          muted: 'rgb(var(--tx-muted) / <alpha-value>)',
          inverse: 'rgb(var(--tx-inverse) / <alpha-value>)',
        },
        // Brand — electric cyan (from web tailwind.config)
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
        error: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', DEFAULT: '#ef4444' },
      },
    },
  },
  plugins: [],
}
