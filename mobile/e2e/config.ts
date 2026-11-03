// The Expo web image (mobile/Dockerfile.web) publishes on APP_PORT, 8081 by default so it
// can run beside the Vite image on 80. BASE_URL overrides for anything else (a local
// `npx serve`, a deployed preview).
const appPort = process.env.APP_PORT ?? '8081'

export const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${appPort}`).replace(/\/$/, '')

// API_BASE is used by the Playwright `request` fixture (not the browser). It defaults to
// the image's own /api proxy, which is the path the app itself takes, so a broken proxy
// fails the suite rather than hiding behind a direct call to the backend.
export const API_BASE = process.env.API_URL ?? `${BASE_URL}/api/v1`
