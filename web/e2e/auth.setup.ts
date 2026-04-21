import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill('demo@lyftr.local')
  await page.locator('input[type="password"]').fill('password123')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('/')
  await expect(page.locator('h1, h2').first()).toBeVisible()
  await page.context().storageState({ path: authFile })
})
