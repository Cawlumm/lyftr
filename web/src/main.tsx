import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { hydrateStores } from './lib/lyftr'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

const render = () =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

// Load persisted state before the first paint. The stores' API is async because
// mobile's Keychain genuinely is; on web every read is localStorage underneath, so
// this settles within a microtask and nothing visible waits on it.
//
// Rendering first and hydrating after would show one frame of default state, and the
// screens that read these do it in mount-only effects — the gym-layout election never
// re-runs, so a frame is not a flicker there, it is the wrong layout for the session.
//
// A rejection still renders: the app's defaults are usable, and a blank page because
// localStorage was unavailable (Safari private mode, storage disabled) would be a far
// worse failure than starting with an empty server URL.
hydrateStores().catch(() => {}).then(render)
