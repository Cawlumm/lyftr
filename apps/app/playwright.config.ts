import { defineConfig, devices } from '@playwright/test'
import { BASE_URL } from './e2e/config'

// The e2e gate since the cut-over (C35): web/playwright.config.ts's projects and worker
// discipline, pointed at the frontend image built from apps/app/Dockerfile.web.
export default defineConfig({
  testDir: './e2e',
  // Waits for the API and the exercise seed by registering its own probe account, so the
  // suite depends on no pre-existing user (DEMO_MODE is off in CI).
  globalSetup: './e2e/globalSetup.ts',
  // Deletes every e2e account created during the run (recorded in userRegistry).
  globalTeardown: './e2e/globalTeardown.ts',
  // Parallel by file, not by test: a file's tests run in order in one worker and share its
  // beforeAll seed, so tests within a file may build on each other. Files share nothing but
  // the read-only exercise catalogue: each worker registers its own account (e2e/fixtures.ts)
  // and the backend serialises writes through one SQLite connection.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI: a public repo's ubuntu-24.04 runner has 4 vCPUs and 16 GB. Three Chromium workers
  // leave a core for the compose stack (backend + nginx) the tests are driving. Locally one,
  // because the machine is shared: pass --workers=2 to opt in.
  workers: process.env.CI ? 3 : 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // storageState is supplied per-worker by e2e/fixtures.ts (logged-in specs).
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium-only flags (WebKit fails to launch with them): a synthetic camera for the
        // scanner tests, granted without a prompt.
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
    {
      // Runs ONLY @mobile-tagged tests: the flows where the phone viewport itself is under
      // test, plus a critical smoke. Chromium runs the full suite.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      grep: /@mobile/,
    },
  ],
})
