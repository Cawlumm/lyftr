import { test as base, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Must match playwright.config's baseURL (non-docker default). The config `use`
// options don't apply to the manual context we create below, so set it here.
const BASE_URL = process.env.BASE_URL ?? 'https://localhost:5173'

export type WorkerAuth = { token: string; email: string }

// One fresh, isolated account per worker — the foundation for test isolation.
// Previously every data spec seeded into the single shared demo user, so state
// accumulated across tests AND across runs, which is why each spec carried
// fragile "wipe ALL E2E-prefixed entries" pre-cleanup. A brand-new account per
// run starts empty, so that pre-cleanup is unnecessary and runs are hermetic.
// (Currently workers:1 — one fresh user per run. The fixture is worker-scoped so
// it already supports workers>1 once the DB layer can take the write concurrency.)
export const test = base.extend<object, { workerAuth: WorkerAuth }>({
  workerAuth: [async ({ browser }, use, workerInfo) => {
    const idx = workerInfo.parallelIndex
    const email = `e2e-w${idx}-${Date.now()}@lyftr.local`
    const password = 'password123'
    const storageStatePath = path.join(__dirname, `.auth/worker-${idx}.json`)

    // Register via the real UI so the browser session + tokens are captured
    // exactly as the app writes them (token lives in localStorage). This manual
    // context needs baseURL + ignoreHTTPSErrors set explicitly — the config
    // `use` options only apply to test-created contexts, not this one.
    const context = await browser.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      storageState: undefined,
    })
    const page = await context.newPage()
    await page.goto('/register')
    await page.getByPlaceholder('you@example.com').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('#password-confirm').fill(password)
    await page.getByRole('button', { name: /create account/i }).click()
    await page.waitForURL(u => new URL(u).pathname === '/')
    await context.storageState({ path: storageStatePath })
    const token = await page.evaluate(() => localStorage.getItem('access_token'))
    await context.close()

    if (!token) throw new Error(`worker ${idx}: failed to obtain access_token after register`)

    await use({ token, email })
  }, { scope: 'worker' }],

  // Logged-in specs get this worker's freshly-registered storage state.
  storageState: async ({ workerAuth }, use, workerInfo) => {
    void workerAuth // ensure the worker account is registered first
    await use(path.join(__dirname, `.auth/worker-${workerInfo.parallelIndex}.json`))
  },
})

export { expect }
