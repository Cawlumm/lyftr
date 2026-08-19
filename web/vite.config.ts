import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolveConfig } from './vite.resolve'
import type { Connect, Plugin } from 'vite'

// The W3C Change Password URL. Password managers (Safari Keychain, Chrome Password
// Checkup, 1Password) open /.well-known/change-password to send a user straight to a
// site's change-password form, and expect a redirect rather than a page.
//
// Production serves this from nginx (web/nginx.conf.template, fly/nginx.fly.conf). This
// plugin is the dev/preview equivalent, so the behaviour is identical in every mode the
// e2e suite can run against — without it the SPA fallback would answer with index.html
// and React Router would bounce the user to /login.
const CHANGE_PASSWORD_URL = '/.well-known/change-password'

function wellKnownChangePassword(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== CHANGE_PASSWORD_URL) return next()
    res.writeHead(302, { Location: '/settings/password' })
    res.end()
  }
  return {
    name: 'lyftr-well-known-change-password',
    configureServer: server => { server.middlewares.use(middleware) },
    configurePreviewServer: server => { server.middlewares.use(middleware) },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    wellKnownChangePassword(),
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
