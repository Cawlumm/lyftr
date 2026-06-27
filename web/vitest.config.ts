import { defineConfig } from 'vitest/config'

// Pin a fixed, DST-aware non-UTC timezone so the local<->UTC date tests are
// deterministic no matter how vitest is launched. The `test:unit` npm script
// also sets TZ via cross-env, but doing it here too means a raw `vitest` run or
// an IDE's test runner (which bypass the script) don't false-fail.
process.env.TZ ??= 'America/New_York'

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
