import { defineConfig, devices } from '@playwright/test'
import { BASE_URL } from './e2e/config'

// The Expo app's counterpart of web/playwright.config.ts: same projects, same worker
// discipline, pointed at the image built from mobile/Dockerfile.web. The web suite keeps
// gating until the cutover; specs move here one chunk at a time.
export default defineConfig({
  testDir: './e2e',
  // Waits for the API and the exercise seed by registering its own probe account, so the
  // suite depends on no pre-existing user (DEMO_MODE is off in CI).
  globalSetup: './e2e/globalSetup.ts',
  // Deletes every e2e account created during the run (recorded in userRegistry).
  globalTeardown: './e2e/globalTeardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker: the backend is a single SQLite writer that drops writes under concurrent
  // load. Each worker still registers its own isolated user (see e2e/fixtures.ts).
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // storageState is supplied per-worker by e2e/fixtures.ts (logged-in specs).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // Runs ONLY @mobile-tagged tests: the flows where the phone viewport itself is under
      // test, plus a critical smoke. Chromium runs the full suite.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      grep: /@mobile/,
    },
  ],
})
