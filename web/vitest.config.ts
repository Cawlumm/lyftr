import { defineConfig } from 'vitest/config'

// Unit tests only. Scoped to src/**/*.test.ts(x) so it never picks up the
// Playwright e2e specs (e2e/**/*.spec.ts), which run under a separate runner.
export default defineConfig({
  test: {
    // jsdom (not node) because importing the stores touches `localStorage` and
    // `window` at module load. Per-test scheme/protocol logic is injected, not
    // read from the DOM, so tests stay deterministic.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})
