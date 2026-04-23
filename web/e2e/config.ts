// Configure E2E tests for self-hosted instances by setting env vars.
// Both Vite (dev) and nginx (prod) proxy /api through the frontend host,
// so BASE_URL is the only var you normally need to change.
//
// Dev:    BASE_URL defaults to http://localhost:5173 (Vite proxy → :3000)
// Docker: BASE_URL=http://localhost (nginx proxy → backend:3000)
// Custom: BASE_URL=https://lyftr.example.com
//
// Override just the API separately only if it's on a different host:
//   API_URL=https://api.example.com/api/v1

const base = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')

export const API_BASE = process.env.API_URL ?? `${base}/api/v1`
export const TEST_EMAIL = process.env.TEST_EMAIL ?? 'demo@lyftr.local'
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123'
