import { appendFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tokens of accounts created during the run, swept by globalTeardown. This gives
// a hard cleanup guarantee without needing an admin "list/delete users" endpoint:
// whoever creates a throwaway account records its token here, and globalTeardown
// deletes every one at the end — even if a per-test cleanup missed (a transient
// DELETE /me under load) or a test crashed before cleaning up. Gitignored (.auth).
export const REGISTRY_FILE = path.join(__dirname, '.auth', 'created-tokens.txt')

export function recordCreatedUser(token: string): void {
  try {
    mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
    appendFileSync(REGISTRY_FILE, token + '\n')
  } catch {
    // best-effort — globalTeardown is the catch-all, not this record step
  }
}
