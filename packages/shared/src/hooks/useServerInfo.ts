import { useEffect, useState } from 'react'
import type { ServerInfo } from '../client'

type Probe = (
  base: string,
) => Promise<{ ok: true; info: ServerInfo } | { ok: false; message: string }>

// Cache keyed by server URL, module-level so it survives remounts. Both apps share it
// because both have exactly one server selected at a time.
const cache = new Map<string, ServerInfo>()

// Fetches a backend's /info once per server URL and caches it, so the footer, Settings
// and the auth screens can show a live version and registration state. Returns null
// while loading or when the server is unreachable — callers render a graceful fallback
// rather than a stuck "Loading" (the failure mode some apps hit by hard-depending on
// the fetch).
//
// The probe is injected rather than imported: it keeps this hook free of the platform's
// API-client wiring, and lets each app's tests substitute one — same reason
// useServerList takes its fetcher.
//
// The cached copy can go stale within a session. Under REGISTRATION=first-user the
// server flips to closed the moment the owner registers, while this still says open, so
// the "Create account" link can linger until reload. That is acceptable precisely
// because the flag is advisory: registering navigates away anyway, and the server
// rejects a second signup regardless of what the UI offered.
export function useServerInfoFor(base: string, probe: Probe): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(() => cache.get(base) ?? null)

  useEffect(() => {
    const cached = cache.get(base)
    if (cached) {
      setInfo(cached)
      return
    }
    let active = true
    probe(base).then((result) => {
      if (active && result.ok) {
        cache.set(base, result.info)
        setInfo(result.info)
      }
    })
    return () => {
      active = false
    }
    // probe is a module-level function in both apps; re-running on identity changes
    // would refetch on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  return info
}

// Whether to offer a "Create account" affordance. Anything other than an explicit
// false means yes — a backend older than this feature omits the field entirely, and a
// new client must not hide a working signup link against an old server.
export function registrationOpen(info: ServerInfo | null | undefined): boolean {
  return info?.registration_open !== false
}

// Whether to offer one-tap demo sign-in. Only an explicit true counts — the inverse of
// registrationOpen() above, and deliberately so. A wrongly-shown "Create account" link
// costs a 403 on submit; a wrongly-shown demo button asks someone to sign in as an account
// that was never seeded, which fails and looks like the app is broken. So an old backend,
// an unreachable one, or a still-loading probe all mean no button.
export function demoMode(info: ServerInfo | null | undefined): boolean {
  return info?.demo_mode === true
}
