// Re-export shim — see stores/settings.ts for why these exist. The store is the
// shared factory bound to web's localStorage adapter; the URL helpers (including
// isMixedContentBlocked, which moved INTO @lyftr/shared with this change) are shared.
export { useServerStore } from '../lib/lyftr'
export {
  normalizeServerUrl,
  isInsecureServerUrl,
  isMixedContentBlocked,
} from '@lyftr/shared'
