/// <reference lib="webworker" />
import { precacheAndRoute, matchPrecache } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// Precaches everything vite-plugin-pwa's injectManifest step found via
// globPatterns (built JS/CSS/HTML + the icon/offline assets in public/).
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigations: try the network first (fresh app shell), fall back to the
// cached index.html so deep links still load while offline. Excludes /api/* —
// nginx proxies it same-origin, so a plain top-level navigation to an authenticated
// API endpoint (e.g. a future export/magic-link) would otherwise have its response
// cached here independent of the Authorization header, bypassing the auth boundary
// for anyone who can read Cache Storage on this origin.
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'lyfter-pages',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 50 }),
    ],
  }),
)

// Static assets (fonts, images) not already precached — cache-first, capped.
// statuses includes 0: exercise images (raw.githubusercontent.com, no crossorigin
// attribute) and the Google Fonts stylesheet are fetched in no-cors mode, so the SW
// sees an opaque response (status 0) even on success — statuses: [200] alone would
// silently drop every one of them and never populate this cache.
registerRoute(
  ({ request }) => ['image', 'font', 'style', 'script'].includes(request.destination),
  new CacheFirst({
    cacheName: 'lyfter-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)

// Last resort: if a navigation fails and nothing cached matches — e.g. a deep
// route like /workouts/5 that was only ever reached via client-side routing,
// so the NetworkFirst 'lyfter-pages' cache above has no entry for it — fall
// back to the precached app shell (index.html) so the SPA router can still
// mount and render offline. Only if even that's missing (very first visit
// made while offline) do we serve the dedicated offline page.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (
      (await matchPrecache('index.html')) ??
      (await matchPrecache('offline.html')) ??
      Response.error()
    )
  }
  return Response.error()
})

// registerType: 'prompt' — only take over once the user confirms the "update
// available" toast (App.tsx), via updateServiceWorker() posting this message.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', () => self.clients.claim())
