import { useState } from 'react'
import { ChevronDown, Server, CheckCircle2, AlertTriangle, Loader } from 'lucide-react'
import { useServerStore, normalizeServerUrl } from '../stores/server'
import { testServerConnection } from '../services/api'

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string }
  | { kind: 'warn'; message: string }
  | { kind: 'error'; message: string }

// Bitwarden-style server selector shared by Login and Register: validates and
// normalizes the URL, tests connectivity against the backend's public /info, and
// saves regardless of the result (a server may be temporarily down) while showing
// clear status. Empty means "use this site's own origin via the reverse proxy".
export default function ServerSettings() {
  const { serverUrl, setServerUrl } = useServerStore()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(serverUrl)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const handleSave = async () => {
    const raw = input.trim()
    const normalized = normalizeServerUrl(raw) // '' = same origin (reverse proxy)
    if (raw && !normalized) {
      setStatus({
        kind: 'error',
        message: 'Include http:// or https:// — e.g. http://192.168.1.10:3000',
      })
      return
    }
    // Save immediately (warn-but-save): the choice is authoritative right away;
    // the connection probe below is advisory and may lag on a slow/down server.
    setServerUrl(normalized)
    setInput(normalized)
    setStatus({ kind: 'testing' })
    const result = await testServerConnection(normalized)
    setStatus(
      result.ok
        ? { kind: 'ok', message: `Connected · ${result.info.name} ${result.info.version}` }
        : { kind: 'warn', message: `Saved, but ${result.message}` },
    )
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 w-full text-xs text-tx-muted hover:text-tx-secondary rounded-lg hover:bg-surface-muted/40 transition-colors"
      >
        <Server className="w-3.5 h-3.5" />
        <span>Server settings</span>
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 p-3 bg-surface-muted/30 border border-surface-border rounded-lg space-y-2">
          <label className="block text-xs font-medium text-tx-secondary uppercase tracking-wider">Server URL</label>
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setStatus({ kind: 'idle' }) }}
            placeholder="Leave blank to use this site"
            className="input text-sm"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          <p className="text-[11px] leading-relaxed text-tx-muted">
            Full URL, e.g. <span className="font-mono text-tx-secondary">http://192.168.1.10:3000</span>
          </p>

          {status.kind === 'error' && <p className="text-xs text-error-400">{status.message}</p>}
          {status.kind === 'warn' && (
            <p className="flex items-start gap-1.5 text-xs text-warning-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{status.message}</span>
            </p>
          )}
          {status.kind === 'ok' && (
            <p className="flex items-center gap-1.5 text-xs text-success-500">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{status.message}</span>
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={status.kind === 'testing'}
              className="flex-1 px-2 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {status.kind === 'testing'
                ? (<><Loader className="w-3.5 h-3.5 animate-spin" /> Testing…</>)
                : 'Test & Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-2 py-1.5 text-xs bg-surface-border text-tx-secondary hover:bg-surface-border/80 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-tx-muted pt-1">
            {serverUrl ? `Current: ${serverUrl}` : 'Using this site’s address (reverse proxy)'}
          </p>
        </div>
      )}
    </div>
  )
}
