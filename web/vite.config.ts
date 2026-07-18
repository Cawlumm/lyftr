import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Self-signed HTTPS so getUserMedia works on mobile LAN during dev.
    // Production HTTPS is handled by the reverse proxy (nginx/Caddy) — this never runs in builds.
    ...(command === 'serve' ? [basicSsl()] : []),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registered manually via useRegisterSW() in App.tsx so we can surface an
      // "update available" toast instead of silently auto-reloading.
      injectRegister: false,
      registerType: 'prompt',
      devOptions: { enabled: false },
      // Icons are already covered by injectManifest's globPatterns below —
      // don't let the plugin add duplicate precache entries for them.
      includeManifestIcons: false,
      injectManifest: {
        // Covers built JS/CSS, index.html, offline.html, and everything in
        // public/ (icons, splash screens, logo/favicon svgs).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Lyfter - Workout Tracking',
        short_name: 'Lyfter',
        description: 'Self-hosted workout tracker — programs, workouts, nutrition, weight.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#070d1a',
        theme_color: '#00b8d9',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // expose to LAN for mobile testing
    proxy: {
      '/api': {
        // Overridable so an isolated dev server (e.g. a worktree running its own
        // backend on a non-default port) can point at that instance instead of
        // whatever's on :3000.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
