import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// When running against docker-compose, read PORT from root .env automatically
// so `npm run test:e2e:docker` works with zero extra config.
function dockerBaseURL(): string {
  try {
    const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
    const match = env.match(/^PORT=(\d+)/m)
    const port = match?.[1] ?? '80'
    return port === '80' ? 'http://localhost' : `http://localhost:${port}`
  } catch {
    return 'http://localhost'
  }
}

const baseURL = process.env.BASE_URL
  ?? (process.env.E2E_DOCKER ? dockerBaseURL() : 'https://localhost:5173')

export default defineConfig({
  testDir: './e2e',
  // Deletes every e2e account created during the run (recorded in userRegistry),
  // guaranteeing the DB is left as it started — no orphaned test users locally.
  globalTeardown: './e2e/globalTeardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Kept at 1 for now: each worker registers its own isolated user (see
  // e2e/fixtures.ts), so the suite is parallel-SAFE, but the backend is a single
  // SQLite writer (DELETE journal mode) that drops writes under concurrent load.
  // Raising workers waits on SQLite WAL (a separate backend change).
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // storageState is supplied per-worker by e2e/fixtures.ts (logged-in specs).
    // auth.spec imports @playwright/test directly and stays logged out.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // Mobile (iPhone-14) runs ONLY @mobile-tagged tests — the flows where the
      // phone viewport itself is under test (gym mode, barcode scanner) plus a
      // critical auth smoke. Chromium (above) runs the full suite, so business
      // logic is covered once; the mobile project guards mobile-specific UX
      // without re-running every viewport-independent test. See docs/TESTING.md.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      grep: /@mobile/,
    },
  ],
})
