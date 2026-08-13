import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolveConfig } from './vite.resolve'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Self-signed HTTPS so getUserMedia works on mobile LAN during dev.
    // Production HTTPS is handled by the reverse proxy (nginx/Caddy) — this never runs in builds.
    ...(command === 'serve' ? [basicSsl()] : []),
  ],
  resolve: resolveConfig.resolve,
  server: {
    port: 5173,
    host: true, // expose to LAN for mobile testing
    fs: resolveConfig.server.fs,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
