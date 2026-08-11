// Re-export shim — see stores/settings.ts. The auth store is now the shared factory
// bound to web's localStorage adapter, hydrated in main.tsx before the first render.
//
// The synchronous localStorage read this store used to do at module init is what made
// the catch-all <Navigate to="/login"> safe. The shared store starts unauthenticated
// and hydrates, so that safety now comes from the hydration gate instead — see the
// comment on hydrateStores, and e2e/auth.spec.ts's deep-link reload case.
export { useAuthStore } from '../lib/lyftr'
