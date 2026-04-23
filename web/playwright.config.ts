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
  ?? (process.env.E2E_DOCKER ? dockerBaseURL() : 'http://localhost:5173')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
})
