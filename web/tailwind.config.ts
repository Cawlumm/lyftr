import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1E40AF',
        accent: '#FB923C',
        success: '#22C55E',
        warning: '#EF4444',
      }
    },
  },
  plugins: [],
} satisfies Config
