import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getBase(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '')
  if (process.env.E2E_DOCKER) {
    try {
      const env = readFileSync(resolve(__dirname, '../../.env'), 'utf8')
      const match = env.match(/^PORT=(\d+)/m)
      const port = match?.[1] ?? '80'
      return port === '80' ? 'http://localhost' : `http://localhost:${port}`
    } catch {
      return 'http://localhost'
    }
  }
  return 'http://localhost:5173'
}

const base = getBase()

// API_BASE is used by the Playwright `request` fixture (not the browser).
// Direct calls to :3000 bypass the Vite proxy and avoid its HTTPS self-signed cert.
// Docker mode keeps routing through the reverse proxy.
export const API_BASE = process.env.API_URL ?? (
  process.env.E2E_DOCKER ? `${base}/api/v1` : 'http://localhost:3000/api/v1'
)
export const TEST_EMAIL = process.env.TEST_EMAIL ?? 'demo@lyftr.local'
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123'
