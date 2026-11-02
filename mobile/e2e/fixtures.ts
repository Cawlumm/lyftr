import { test as base, expect } from '@playwright/test'
import path from 'path'
import { recordCreatedUser } from './userRegistry'

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

    // Register via the real UI so the browser session + tokens are captured exactly as the
    // app writes them (AsyncStorage on web is localStorage, same keys as the Vite app).
    // This manual context needs baseURL set explicitly: the config `use` options only apply
    // to test-created contexts. Read the project's RESOLVED baseURL, don't hardcode.
    const baseURL = workerInfo.project.use.baseURL as string
    const context = await browser.newContext({ baseURL, storageState: undefined })
    const page = await context.newPage()
    await page.goto('/register')
    // The Expo inputs carry no ids or associated labels yet, so they are found by
    // placeholder, and only the visible ones: the stack keeps the login screen mounted
    // under register with display:none, so each placeholder matches twice. The two
    // password fields share one, in DOM order.
    await page.getByPlaceholder('you@example.com').locator('visible=true').fill(email)
    const passwords = page.getByPlaceholder('••••••••').locator('visible=true')
    await passwords.nth(0).fill(password)
    await passwords.nth(1).fill(password)
    await page.getByRole('button', { name: /create account/i })
      .or(page.getByText(/^create account$/i).last())
      .click()
    await page.waitForURL(u => new URL(u).pathname === '/')
    await context.storageState({ path: storageStatePath })
    const token = await page.evaluate(() => localStorage.getItem('access_token'))
    await context.close()

    if (!token) throw new Error(`worker ${idx}: failed to obtain access_token after register`)

    // Record for globalTeardown to delete at the end (cascades all its data).
    // Centralized cleanup with retry — robust to transient failures and crashes.
    recordCreatedUser(token)

    await use({ token, email })
  }, { scope: 'worker' }],

  // Logged-in specs get this worker's freshly-registered storage state.
  storageState: async ({ workerAuth }, use, workerInfo) => {
    void workerAuth // ensure the worker account is registered first
    await use(path.join(__dirname, `.auth/worker-${workerInfo.parallelIndex}.json`))
  },
})

export { expect }
