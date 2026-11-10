import { apiUrl } from '../client'
import { normalizeServerUrl } from './serverUrl'

// oedb serves one ~750x500 rendition per image, and list rows draw it at 44-56 px. The
// backend keeps a 192 px copy of each (GET /media/exercise-thumbs/:id, stores/thumbs.go),
// made once and served from the user's own server.
//
// Only an oedb image url is rewritten, and the caller keeps the original to fall back to:
// an app newer than its server would otherwise ask for a route that does not exist yet.
const OEDB_IMAGE = /\/api\/v1\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

// serverUrl is the stored server setting; '' means same origin (the web export behind nginx).
export function exerciseThumbUrl(imageUrl: string | undefined, serverUrl: string): string | undefined {
  const id = imageUrl?.match(OEDB_IMAGE)?.[1]
  if (!id) return undefined
  return `${apiUrl(normalizeServerUrl(serverUrl))}/media/exercise-thumbs/${id}`
}
